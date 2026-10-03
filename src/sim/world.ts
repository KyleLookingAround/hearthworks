import { makeRng, rand, valueNoise } from './rng.ts';
import { makeAgent, removeAgent } from './agents.ts';
import { plannerOn } from './planner.ts';
import { foundersKnowledge } from './knowledge.ts';
import { findPath } from './path.ts';
import type { Agent, Building, Content, GameEvent, State, Town, World } from './types.ts';

export const inB = (w: World, x: number, y: number) => x >= 0 && y >= 0 && x < w.w && y < w.h;
export const door = (b: Building) => ({ x: b.x + Math.floor(b.w / 2), y: b.y + b.h - 1 });
export const ctr = (b: { x: number; y: number; w: number; h: number }) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });
export const distAB = (a: { x: number; y: number }, b: Building) => { const p = ctr(b); return Math.hypot(a.x - p.x, a.y - p.y); };
export const distBB = (a: Building, b: Building) => { const p = ctr(a), q = ctr(b); return Math.hypot(p.x - q.x, p.y - q.y); };
export const add = (o: Record<string, number>, k: string, v: number) => { o[k] = (o[k] || 0) + v; if (Math.abs(o[k]) < 1e-9) o[k] = 0; };
export const bp = (S: State, b: Building) => S.content.blueprints[b.type];
export const villagers = (S: State): Agent[] => S.agents.filter(a => a.kind === 'villager');
export const hasBuilt = (S: State, type: string) => S.buildings.some(b => b.type === type && !b.site);
export const countBuilt = (S: State, type: string) => S.buildings.filter(b => b.type === type && !b.site).length;

export function emit(S: State, kind: GameEvent['kind'], text: string) {
  S.events.push({ kind, text, t: S.t });
  if (S.events.length > 200) S.events.splice(0, S.events.length - 200);
}

function generateWorld(content: Content, S: State): World {
  const { width: W, height: H } = content.tuning.map;
  const r = S.rng, N = W * H;
  const w: World = { w: W, h: H, ground: new Uint8Array(N), tree: new Uint8Array(N), grow: new Float32Array(N), road: new Uint8Array(N), bgrid: new Int32Array(N).fill(-1) };
  const n1 = valueNoise(r, 9, W, H), n2 = valueNoise(r, 4, W, H), n3 = valueNoise(r, 6, W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, dx = (x + 0.5 - W / 2) / (W / 2), dy = (y + 0.5 - H / 2) / (H / 2), d = dx * dx + dy * dy;
    let h = 0.5 * n1(x, y) + 0.3 * n2(x, y) + 0.45 - 0.78 * d;
    if (d < 0.06) h = Math.max(h, 0.7);
    w.ground[i] = (x === 0 || y === 0 || x === W - 1 || y === H - 1) ? 0 : h > 0.5 ? 2 : h > 0.45 ? 1 : 0;
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (w.ground[i] === 2 && ((n3(x, y) > 0.56 && rand(r) < 0.8) || rand(r) < 0.03)) w.tree[i] = 2;
  }
  const cx = Math.floor(W / 2), cy = Math.floor(H / 2);
  for (let y = cy - 8; y <= cy - 3; y++) for (let x = cx - 12; x <= cx - 6; x++) {
    const i = y * W + x;
    if (inB(w, x, y) && w.ground[i] === 2 && rand(r) < 0.7) w.tree[i] = 2;
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (Math.hypot(x + 0.5 - cx, (y + 0.5 - cy) * 1.2) < 5.5) w.tree[y * W + x] = 0;
  return w;
}

/**
 * A new island with the starting settlement at its centre: a storage yard, two houses and a short road.
 * `settlements` above 1 founds neighbours the same way, as far apart as the land allows.
 * The village planner is off unless `planner` is set, so scripted scenarios stay scripted.
 */
export function createState(content: Content, seed: number, opts: { planner?: boolean; settlements?: number } = {}): State {
  const S = {
    content, seed, rng: makeRng(seed), krng: makeRng(seed ^ 0x6b6e6f77), t: 0, buildings: [], agents: [], bmap: new Map(), amap: new Map(), nextId: 1,
    mood: 1, migT: 0, secT: 0, events: [], towns: [],
    stats: { made: {}, deliveries: { villager: 0, bot: 0 }, arrivals: 0, departures: 0, peakVillagers: 0, invented: 0, taught: 0, forgotten: 0 },
  } as unknown as State;
  S.world = generateWorld(content, S);
  const { w: W, h: H } = S.world;
  foundTown(S, Math.floor(W / 2), Math.floor(H / 2), opts.planner ?? false);
  for (let k = 1; k < (opts.settlements ?? 1); k++) {
    const at = neighbourSite(S);
    if (!at) break;
    foundTown(S, at.x, at.y, opts.planner ?? false);
  }
  S.planner = S.towns[0].planner;
  S.stats.peakVillagers = villagers(S).length;
  return S;
}

/** Lay out a settlement around (cx, cy): storage, a house either side, a road and the starting villagers. */
function foundTown(S: State, cx: number, cy: number, planner: boolean): Town {
  const content = S.content, t = content.tuning.start, W = S.world.w;
  const id = S.towns.length;
  const store = placeBuilding(S, 'storage', cx - 1, cy - 1, true)!;
  store.inv = { ...t.storage };
  const town: Town = { id, name: t.names[id % t.names.length], store: store.id, knows: foundersKnowledge(content), planner: plannerOn(planner), haul: 0, visitT: 0 };
  S.towns.push(town);
  const h1 = placeBuilding(S, 'house', cx - 5, cy - 1, true)!, h2 = placeBuilding(S, 'house', cx + 3, cy - 1, true)!;
  for (const b of [store, h1, h2]) b.town = id;
  h1.inv = { ...t.houseStock }; h2.inv = { ...t.houseStock };
  for (let x = cx - 5; x <= cx + 4; x++) if (S.world.ground[(cy + 2) * W + x]) { S.world.road[(cy + 2) * W + x] = 1; S.world.tree[(cy + 2) * W + x] = 0; }
  const homes = [h1, h2], cap = content.blueprints.house.homes;
  for (let k = 0; k < t.villagers; k++) {
    const home = homes.find(h => h.residents.length < cap);
    const a = makeAgent(S, 'villager', cx - 1.5 + (k % 5), cy + 2.5);
    if (home) { a.home = home; home.residents.push(a.id); }
  }
  return town;
}

/**
 * Where a neighbour can settle: the whole starting layout on open grass with a one-tile margin,
 * at least `neighbour_min_distance` from every settlement and reachable on foot. Of those, the
 * farthest from its nearest settlement, then the most land around it to grow into.
 * Deterministic scan; null if the island has no room.
 */
function neighbourSite(S: State): { x: number; y: number } | null {
  const w = S.world, t = S.content.tuning.start;
  const centres = S.towns.map(tn => ctr(S.bmap.get(tn.store)!));
  const home = door(S.bmap.get(S.towns[0].store)!);
  let best: { x: number; y: number } | null = null, bestD = -1, bestRoom = -1;
  for (let cy = 3; cy < w.h - 4; cy++) for (let cx = 7; cx < w.w - 6; cx++) {
    const d = Math.min(...centres.map(c => Math.hypot(cx - c.x, cy - c.y)));
    if (d < t.neighbourMinDistance || Math.floor(d) < bestD) continue;
    let ok = true;
    for (let y = cy - 2; y <= cy + 3 && ok; y++) for (let x = cx - 6; x <= cx + 5; x++) {
      const i = y * w.w + x;
      if (!inB(w, x, y) || w.ground[i] !== 2 || w.bgrid[i] !== -1 || w.road[i]) { ok = false; break; }
    }
    if (!ok) continue;
    let room = 0;
    for (let y = cy - 8; y <= cy + 8; y++) for (let x = cx - 8; x <= cx + 8; x++) if (inB(w, x, y) && w.ground[y * w.w + x] === 2) room++;
    if (Math.floor(d) === bestD && room <= bestRoom) continue;
    if (!findPath(w, home.x, home.y, cx, cy + 1)) continue;
    bestD = Math.floor(d); bestRoom = room; best = { x: cx, y: cy };
  }
  return best;
}

/** The settlement whose first storage yard is nearest to a point. */
export function nearestTown(S: State, x: number, y: number): number {
  let best = 0, bd = Infinity;
  for (const tn of S.towns) {
    const s = S.bmap.get(tn.store);
    if (!s) continue;
    const c = ctr(s), d = Math.hypot(c.x - x, c.y - y);
    if (d < bd) { bd = d; best = tn.id; }
  }
  return best;
}

/** The settlement a villager or bot belongs to. */
export const townOf = (S: State, a: Agent) => a.home?.town ?? a.depot?.town ?? nearestTown(S, a.x, a.y);

export function canPlace(S: State, type: string, x: number, y: number): boolean {
  const B = S.content.blueprints[type], w = S.world;
  if (!B) return false;
  for (let j = y; j < y + B.h; j++) for (let k = x; k < x + B.w; k++) {
    if (!inB(w, k, j)) return false;
    const i = j * w.w + k;
    if (!w.ground[i] || w.bgrid[i] !== -1) return false;
    if (B.paves && w.road[i]) return false;
  }
  return true;
}

/** Place a building (or a road tile). New buildings start as construction sites unless `complete`. */
export function placeBuilding(S: State, type: string, x: number, y: number, complete: boolean): Building | null {
  const B = S.content.blueprints[type], w = S.world;
  if (B.paves) { const i = y * w.w + x; w.road[i] = 1; w.tree[i] = 0; return null; }
  const b: Building = {
    id: S.nextId++, type, x, y, w: B.w, h: B.h, site: !complete, build: 0, inv: {}, incoming: {}, reserved: {},
    worker: null, timer: 0, plantT: 0, paused: false, status: { t: '', l: 'ok' }, residents: [], eat: 0, hunger: 0, bots: [], dead: false, priority: 0, reason: '', town: nearestTown(S, x + B.w / 2, y + B.h / 2), used: 0,
  };
  for (let j = y; j < y + B.h; j++) for (let k = x; k < x + B.w; k++) { const i = j * w.w + k; w.bgrid[i] = b.id; w.tree[i] = 0; w.road[i] = 0; }
  S.buildings.push(b); S.bmap.set(b.id, b);
  if (complete) completeSite(S, b, false);
  return b;
}

export function completeSite(S: State, b: Building, announce: boolean) {
  b.site = false; b.build = 0; b.inv = {}; b.incoming = {}; b.reserved = {};
  const B = bp(S, b);
  if (B.couriers) {
    const d = door(b);
    for (let k = 0; k < B.couriers.count; k++) {
      const a = makeAgent(S, 'bot', d.x + 0.5 + (k - 1) * 0.3, d.y + 0.5);
      a.depot = b; b.bots.push(a.id);
    }
    if (announce) emit(S, 'good', `${B.name} finished: ${B.couriers.count} bots are hauling`);
  } else if (announce) emit(S, 'good', `${B.name} finished`);
}

export function demolish(S: State, b: Building) {
  b.dead = true;
  S.buildings = S.buildings.filter(o => o !== b); S.bmap.delete(b.id);
  const w = S.world;
  for (let j = b.y; j < b.y + b.h; j++) for (let k = b.x; k < b.x + b.w; k++) w.bgrid[j * w.w + k] = -1;
  for (const a of S.agents) if (a.work === b) { a.work = null; a.role = 'carrier'; a.state = 'idle'; a.path = []; }
  const gone = b.residents.length;
  for (const id of [...b.residents]) { const a = S.amap.get(id); if (a) { removeAgent(S, a); S.stats.departures++; } }
  for (const id of b.bots) { const a = S.amap.get(id); if (a) removeAgent(S, a); }
  if (gone) emit(S, 'bad', `${gone} villager${gone > 1 ? 's' : ''} left: their home was demolished`);
}
