/**
 * Saves: the whole state as plain JSON with a schema version. The random streams are plain
 * numbers, references between buildings and agents become ids, and tile grids are run-length
 * encoded. Content is not saved: a save is loaded against the design bundle the game runs,
 * and records the hash of the one it was made with.
 *
 * Every change to the state's shape raises SAVE_VERSION and adds a step to MIGRATIONS that
 * turns a save of the version before into one of the new version, with a test that loads a
 * fixture saved at the old version.
 */
import type { Agent, Building, Content, State, Task, World } from './types.ts';

export const SAVE_VERSION = 3;

type Json = Record<string, unknown>;

export interface SaveFile {
  game: 'hearthworks';
  version: number;
  /** Hash of the design bundle the save was made with; the game may run a newer one. */
  content: string;
  state: Json;
}

/** One step per version: MIGRATIONS[v] turns a version v save into version v + 1. */
const MIGRATIONS: Record<number, (state: Json) => Json> = {
  // 1 to 2: planners remember what they found no room for
  1: state => { for (const t of state.towns as { planner: Json }[]) t.planner.noRoom ??= {}; return state; },
  // 2 to 3: buildings remember when nobody could reach them
  2: state => { for (const b of [...state.buildings as Json[], ...(state.gone as Json[] ?? [])]) b.noWay ??= null; return state; },
};

/** Run-length encoding for tile grids: [value, count, value, count, ...]. */
function rle(a: ArrayLike<number>): number[] {
  const out: number[] = [];
  for (let i = 0; i < a.length;) {
    let j = i + 1;
    while (j < a.length && a[j] === a[i]) j++;
    out.push(a[i], j - i);
    i = j;
  }
  return out;
}

function unrle<T extends Uint8Array | Int32Array | Float32Array>(runs: number[], into: T): T {
  let k = 0;
  for (let r = 0; r < runs.length; r += 2) { into.fill(runs[r], k, k + runs[r + 1]); k += runs[r + 1]; }
  if (k !== into.length) throw new Error(`save is damaged: a tile grid has ${k} tiles, expected ${into.length}`);
  return into;
}

const GRIDS = { ground: Uint8Array, tree: Uint8Array, grow: Float32Array, road: Uint8Array, bgrid: Int32Array, door: Uint8Array, front: Uint8Array, dock: Uint8Array } as const;
type GridName = keyof typeof GRIDS;

const copy = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const ref = (b: Building | null) => (b ? b.id : null);

export function saveGame(S: State): SaveFile {
  const w = S.world;
  const world: Json = { w: w.w, h: w.h, docks: w.docks, waterCost: w.waterCost, work: { ...w.work } };
  for (const g of Object.keys(GRIDS) as GridName[]) world[g] = rle(w[g]);
  const task = (t: Task | null) => (t ? { src: t.src.id, dst: t.dst.id, item: t.item, n: t.n } : null);
  // a carrier's job can still point at a building demolished under it: keep those as `gone`
  const live = new Set(S.buildings), gone = new Map<number, Building>();
  const keep = (b: Building | null) => { if (b && !live.has(b)) gone.set(b.id, b); };
  for (const a of S.agents) { keep(a.home); keep(a.work); keep(a.depot); keep(a.task?.src ?? null); keep(a.task?.dst ?? null); }
  const agents = S.agents.map(a => ({ ...copy({ ...a, task: null, home: null, work: null, depot: null }), task: task(a.task), home: ref(a.home), work: ref(a.work), depot: ref(a.depot) }));
  return {
    game: 'hearthworks',
    version: SAVE_VERSION,
    content: S.content.hash,
    state: {
      seed: S.seed, setup: copy(S.setup), rng: S.rng.s, krng: S.krng.s, t: S.t, nextId: S.nextId,
      mood: S.mood, migT: S.migT, secT: S.secT,
      stats: copy(S.stats), events: copy(S.events), towns: copy(S.towns),
      world, buildings: copy(S.buildings), gone: copy([...gone.values()]), agents,
    },
  };
}

/** Bring a save of any earlier version up to SAVE_VERSION. */
export function migrate(file: SaveFile): SaveFile {
  if (file?.game !== 'hearthworks' || typeof file.version !== 'number') throw new Error('not a Hearthworks save');
  if (file.version > SAVE_VERSION) throw new Error(`this save is from a newer version of the game (save version ${file.version}, this game reads up to ${SAVE_VERSION})`);
  let state = file.state;
  for (let v = file.version; v < SAVE_VERSION; v++) {
    const step = MIGRATIONS[v];
    if (!step) throw new Error(`no way to upgrade a version ${v} save`);
    state = step(copy(state));
  }
  return { ...file, version: SAVE_VERSION, state };
}

export function loadGame(content: Content, input: SaveFile | string): State {
  const file = migrate(typeof input === 'string' ? JSON.parse(input) as SaveFile : input);
  const d = copy(file.state) as any;
  const wd = d.world, N = wd.w * wd.h;
  const world = { w: wd.w, h: wd.h, docks: wd.docks, waterCost: wd.waterCost, work: wd.work } as World;
  for (const g of Object.keys(GRIDS) as GridName[]) (world as any)[g] = unrle(wd[g], new GRIDS[g](N));

  const buildings = d.buildings as Building[];
  const bmap = new Map(buildings.map(b => [b.id, b]));
  const gone = new Map((d.gone as Building[]).map(b => [b.id, b]));
  const get = (id: number | null) => {
    if (id === null) return null;
    const b = bmap.get(id) ?? gone.get(id);
    if (!b) throw new Error(`save is damaged: building ${id} is missing`);
    return b;
  };
  const agents = (d.agents as any[]).map(a => ({
    ...a, home: get(a.home), work: get(a.work), depot: get(a.depot),
    task: a.task ? { src: get(a.task.src)!, dst: get(a.task.dst)!, item: a.task.item, n: a.task.n } : null,
  })) as Agent[];

  const S = {
    content, seed: d.seed, setup: d.setup, rng: { s: d.rng }, krng: { s: d.krng }, t: d.t, nextId: d.nextId,
    mood: d.mood, migT: d.migT, secT: d.secT, stats: d.stats, events: d.events, towns: d.towns,
    world, buildings, agents, bmap, amap: new Map(agents.map(a => [a.id, a])),
  } as State;
  S.planner = S.towns[0].planner;
  return S;
}
