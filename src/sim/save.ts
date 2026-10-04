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

export const SAVE_VERSION = 22;

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
  // 3 to 4: being fed is kept apart from mood, which now counts surroundings too
  3: state => {
    state.fed ??= state.mood; for (const t of state.towns as Json[]) t.fed ??= t.mood;
    // terrain arrived: older worlds are flat, with nothing in the ground
    const w = state.world as Json, n = (w.w as number) * (w.h as number);
    w.height ??= [0, n]; w.deposit ??= [0, n]; w.slopeCost ??= 0; w.rockCost ??= 1; w.roadCost ??= 0.59; w.forestCost ??= 1.5;
    // paths worn by feet, delivery times and paving planners arrived too
    w.wear ??= [0, n]; w.bridge ??= [0, n];
    for (const b of [...state.buildings as Json[], ...(state.gone as Json[] ?? [])]) b.doorAt ??= null;
    for (const t of state.towns as Json[]) { t.detour ??= 0; t.detours ??= []; }
    const stats = state.stats as Json; stats.deliverySeconds ??= 0; stats.delivered ??= 0; stats.deliveryTiles ??= 0;
    for (const a of state.agents as Json[]) if (a.task) { (a.task as Json).at ??= state.t; (a.task as Json).tiles ??= 0; }
    for (const t of state.towns as { planner: Json }[]) t.planner.roads ??= true;
    return state;
  },
  // 4 to 5: towns grow districts and streets, and replan old blocks
  4: state => {
    for (const t of state.towns as (Json & { planner: Json })[]) { t.districts ??= [t.store]; t.streets ??= []; t.planner.replanAt ??= 0; }
    const stats = state.stats as Json; stats.replanned ??= 0; stats.demolitionDepartures ??= 0;
    return state;
  },
  // 5 to 6: the steward's levers and zones, and the chronicle
  5: state => {
    const w = state.world as Json; w.zone ??= [0, (w.w as number) * (w.h as number)];
    for (const t of state.towns as (Json & { planner: Json })[]) { t.levers ??= { priority: {}, encourage: null, pace: 1 }; t.form ??= 'hamlet'; t.planner.firstFor ??= {}; }
    state.chronicle ??= [];
    return state;
  },
  // 6 to 7: homes use comforts, workplaces wear out tools, food spoils
  6: state => {
    for (const b of [...state.buildings as Json[], ...(state.gone as Json[] ?? [])]) { b.extra ??= 0; b.wear ??= 0; }
    (state.stats as Json).spoiled ??= 0;
    return state;
  },
  // 7 to 8: seasons (off for older games), homes' firewood, and how long a workplace has stood full
  7: state => {
    state.seasons ??= false;
    for (const b of [...state.buildings as Json[], ...(state.gone as Json[] ?? [])]) { b.fire ??= 0; b.stall ??= 0; }
    return state;
  },
  // 8 to 9: trade (off for older games), each settlement's ledger and wants
  8: state => {
    state.trade ??= false;
    (state.stats as Json).trades ??= 0;
    for (const t of state.towns as (Json & { planner: Json })[]) { t.trade ??= { t: 0, imports: {}, made: {}, exported: {}, imported: {} }; t.planner.wants ??= {}; t.planner.use ??= {}; }
    return state;
  },
  // 9 to 10: people (off for older games): ages, skills, customs and the dead waiting for their farewell
  9: state => {
    state.people ??= false; state.newcomers ??= true; state.prng ??= ((state.seed as number) ^ 0x70656f70) | 0;
    const st = state.stats as Json;
    st.births ??= 0; st.deaths ??= 0; st.honoured ??= 0; st.riteWaitMax ??= 0;
    for (const a of state.agents as Json[]) { a.born ??= 0; a.dies ??= 0; a.skill ??= {}; }
    for (const t of state.towns as Json[]) { t.custom ??= 'burial'; t.rites ??= []; t.graves ??= {}; }
    return state;
  },
  // 10 to 11: learning: who went to school, and each library's copying clock
  10: state => {
    for (const a of state.agents as Json[]) a.schooled ??= false;
    for (const t of state.towns as Json[]) t.copyT ??= 0;
    return state;
  },
  // 11 to 12: carts (off for older games): who has a cart out, how far each settlement's deliveries go, long hauls counted
  11: state => {
    state.carts ??= false;
    for (const a of state.agents as Json[]) a.cart ??= null;
    for (const t of state.towns as Json[]) t.reach ??= 0;
    const st = state.stats as Json;
    for (const k of ['cartDeliveries', 'goodsDelivered', 'longDeliveries', 'longByCart', 'longGoods', 'longGoodsByCart', 'longFootSeconds', 'longCartSeconds']) st[k] ??= 0;
    return state;
  },
  // 12 to 13: settling (off for older games): each settlement's mother and when it last sent settlers
  12: state => {
    state.settlers ??= false;
    for (const t of state.towns as Json[]) { t.mother ??= null; t.sentAt ??= -1e9; t.settleT ??= 0; }
    return state;
  },
  // 13 to 14: the sea: whether each settlement was founded across water
  13: state => {
    for (const t of state.towns as Json[]) t.overseas ??= false;
    return state;
  },
  // 14 to 15: ages: each settlement's age, worked out again from what it knows on its next second
  14: state => {
    for (const t of state.towns as Json[]) t.age ??= 0;
    return state;
  },
  // 15 to 16: hardship (off for older games): fires, floods, sickness and camps, and each settlement's laws
  15: state => {
    state.hardship ??= false; state.hrng ??= ((state.seed as number) ^ 0x68617264) | 0; state.camps ??= []; state.campT ??= 0;
    for (const b of [...state.buildings as Json[], ...(state.gone as Json[] ?? [])]) { b.burn ??= 0; b.flood ??= 0; b.sick ??= 0; }
    for (const t of state.towns as Json[]) { t.laws ??= { rationing: false, hours: 'normal', leave: true }; t.struck ??= {}; }
    const st = state.stats as Json;
    for (const k of ['fires', 'burnt', 'floods', 'outbreaks', 'raids', 'repelled', 'looted', 'sickDeaths', 'starved', 'camps']) st[k] ??= 0;
    return state;
  },
  // 16 to 17: paths and roads: what was the road cost is the path cost (the road cost is read from the game's
  // logistics on load), planned roads (off for older games), and what each delivery walked on
  16: state => {
    const w = state.world as Json;
    w.pathCost ??= w.roadCost; w.roadCost = null; w.roads ??= 0;
    state.plannedRoads ??= false;
    for (const t of state.towns as Json[]) { t.roadT ??= 0; t.roads ??= []; }
    for (const a of state.agents as Json[]) if (a.task) { const k = a.task as Json; k.steps ??= 0; k.road ??= 0; k.path ??= 0; }
    const st = state.stats as Json;
    for (const k of ['roadsLaid', 'roadTiles', 'roadCut', 'roadMoved', 'roadDeliveries', 'roadDeliverySeconds', 'roadDeliveryTiles', 'pathDeliveries', 'pathDeliverySeconds', 'pathDeliveryTiles']) st[k] ??= 0;
    return state;
  },
  // 17 to 18: specialisation: when each settlement first chose to trade for a good rather than make it (none yet)
  17: state => {
    for (const t of state.towns as (Json & { trade: Json })[]) t.trade.waits ??= {};
    return state;
  },
  // 18 to 19: a cart's round: a carrier's job has no further drops yet
  18: state => {
    for (const a of state.agents as Json[]) if (a.task) (a.task as Json).round ??= [];
    return state;
  },
  // 19 to 20: buildings turn: every building so far faces south
  19: state => {
    for (const b of [...state.buildings as Json[], ...(state.gone as Json[] ?? [])]) b.rot ??= 0;
    return state;
  },
  // 20 to 21: farms that grow (off for older games): each building's further hands, size, new fields' farm, what it
  // has made and (a home) when it last ate each food; meals eaten and fields laid
  20: state => {
    state.farms ??= false;
    for (const b of [...state.buildings as Json[], ...(state.gone as Json[] ?? [])]) { b.hands ??= []; b.size ??= 0; b.of ??= null; b.made ??= 0; b.ate ??= {}; }
    const st = state.stats as Json; st.eaten ??= {}; st.grown ??= 0;
    return state;
  },
  // 21 to 22: ox carts: trips set out, and long goods carried by ox cart with their seconds
  21: state => {
    const st = state.stats as Json; st.oxTrips ??= 0; st.longGoodsByOx ??= 0; st.longOxSeconds ??= 0;
    return state;
  },
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

const GRIDS = { ground: Uint8Array, height: Uint8Array, deposit: Uint8Array, wear: Float32Array, bridge: Uint8Array, zone: Uint8Array, tree: Uint8Array, grow: Float32Array, road: Uint8Array, bgrid: Int32Array, door: Uint8Array, front: Uint8Array, dock: Uint8Array } as const;
type GridName = keyof typeof GRIDS;

const copy = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const ref = (b: Building | null) => (b ? b.id : null);

export function saveGame(S: State): SaveFile {
  const w = S.world;
  const world: Json = { w: w.w, h: w.h, docks: w.docks, waterCost: w.waterCost, slopeCost: w.slopeCost, rockCost: w.rockCost, pathCost: w.pathCost, roadCost: w.roadCost, roads: w.roads, forestCost: w.forestCost, work: { ...w.work } };
  for (const g of Object.keys(GRIDS) as GridName[]) world[g] = rle(w[g]);
  const task = (t: Task | null) => (t ? { src: t.src.id, dst: t.dst.id, item: t.item, n: t.n, at: t.at, tiles: t.tiles, steps: t.steps, road: t.road, path: t.path, round: t.round.map(r => ({ dst: r.dst.id, n: r.n })) } : null);
  // a carrier's job can still point at a building demolished under it: keep those as `gone`
  const live = new Set(S.buildings), gone = new Map<number, Building>();
  const keep = (b: Building | null) => { if (b && !live.has(b)) gone.set(b.id, b); };
  for (const a of S.agents) { keep(a.home); keep(a.work); keep(a.depot); keep(a.task?.src ?? null); keep(a.task?.dst ?? null); for (const r of a.task?.round ?? []) keep(r.dst); }
  const agents = S.agents.map(a => ({ ...copy({ ...a, task: null, home: null, work: null, depot: null }), task: task(a.task), home: ref(a.home), work: ref(a.work), depot: ref(a.depot) }));
  return {
    game: 'hearthworks',
    version: SAVE_VERSION,
    content: S.content.hash,
    state: {
      seed: S.seed, setup: copy(S.setup), rng: S.rng.s, krng: S.krng.s, prng: S.prng.s, hrng: S.hrng.s, hardship: S.hardship, plannedRoads: S.plannedRoads, camps: copy(S.camps), campT: S.campT, t: S.t, nextId: S.nextId,
      mood: S.mood, fed: S.fed, migT: S.migT, secT: S.secT,
      stats: copy(S.stats), events: copy(S.events), towns: copy(S.towns), chronicle: copy(S.chronicle), seasons: S.seasons, trade: S.trade, people: S.people, newcomers: S.newcomers, carts: S.carts, settlers: S.settlers, farms: S.farms,
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
  const world = { w: wd.w, h: wd.h, docks: wd.docks, waterCost: wd.waterCost, slopeCost: wd.slopeCost, rockCost: wd.rockCost, pathCost: wd.pathCost, roadCost: wd.roadCost ?? 1 / content.tuning.logistics.roadSpeed, roads: wd.roads, forestCost: wd.forestCost, work: wd.work } as World;
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
    task: a.task ? { src: get(a.task.src)!, dst: get(a.task.dst)!, item: a.task.item, n: a.task.n, at: a.task.at, tiles: a.task.tiles, steps: a.task.steps, road: a.task.road, path: a.task.path, round: (a.task.round as { dst: number; n: number }[]).map(r => ({ dst: get(r.dst)!, n: r.n })) } : null,
  })) as Agent[];

  const S = {
    content, seed: d.seed, setup: d.setup, rng: { s: d.rng }, krng: { s: d.krng }, prng: { s: d.prng }, hrng: { s: d.hrng }, hardship: d.hardship, plannedRoads: d.plannedRoads, camps: d.camps, campT: d.campT, t: d.t, nextId: d.nextId,
    mood: d.mood, fed: d.fed, migT: d.migT, secT: d.secT, stats: d.stats, events: d.events, towns: d.towns, chronicle: d.chronicle, seasons: d.seasons, trade: d.trade, people: d.people, newcomers: d.newcomers, carts: d.carts, settlers: d.settlers, farms: d.farms,
    world, buildings, agents, bmap, amap: new Map(agents.map(a => [a.id, a])),
  } as State;
  S.planner = S.towns[0].planner;
  return S;
}
