import { makeRng, rand, valueNoise } from './rng.ts';
import { goToBuilding, makeAgent, removeAgent } from './agents.ts';
import { plannerOn } from './planner.ts';
import { foundersKnowledge } from './knowledge.ts';
import { findPath } from './path.ts';
import type { Agent, Building, Content, GameEvent, MapDef, State, Town, World } from './types.ts';

export const inB = (w: World, x: number, y: number) => x >= 0 && y >= 0 && x < w.w && y < w.h;
/** The door: middle of the bottom row. The tile below it (the door front) must stay open. */
export const door = (b: { x: number; y: number; w: number; h: number }) => ({ x: b.x + Math.floor(b.w / 2), y: b.y + b.h - 1 });
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

/**
 * Generate a world of the given type and size. Island at the standard size reproduces the
 * original island exactly (same numbers, same random draws in the same order).
 */
function generateWorld(M: MapDef, W: number, H: number, S: State): World {
  const r = S.rng, N = W * H, T = M.terrain, F = M.forest;
  const w: World = { w: W, h: H, ground: new Uint8Array(N), tree: new Uint8Array(N), grow: new Float32Array(N), road: new Uint8Array(N), bgrid: new Int32Array(N).fill(-1), door: new Uint8Array(N), front: new Uint8Array(N), work: { paths: 0, pathFails: 0, pathNodes: 0, jobPairs: 0, plannerSpots: 0 } };
  const n1 = valueNoise(r, T.largeCell, W, H), n2 = valueNoise(r, T.smallCell, W, H), n3 = valueNoise(r, F.cell, W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, dx = (x + 0.5 - W / 2) / (W / 2), dy = (y + 0.5 - H / 2) / (H / 2), radial = dx * dx + dy * dy;
    let d = radial;
    if (M.shape === 'landmass') d = 0;
    else if (M.shape === 'coast') { const s = Math.max(0, (x + 0.5) / W - M.coastline) / (1 - M.coastline); d = s * s * 4; }
    let h = T.large * n1(x, y) + T.small * n2(x, y) + T.base - T.falloff * d;
    if (radial < M.start.landRadius) h = Math.max(h, 0.7);
    const border = x === 0 || y === 0 || x === W - 1 || y === H - 1;
    w.ground[i] = (border && M.shores.seaBorder) ? 0 : h > M.shores.grass ? 2 : h > M.shores.sand ? 1 : 0;
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (w.ground[i] === 2 && ((n3(x, y) > F.threshold && rand(r) < F.density) || rand(r) < F.scatter)) w.tree[i] = 2;
  }
  const cx = Math.floor(W / 2), cy = Math.floor(H / 2);
  for (let y = cy - 8; y <= cy - 3; y++) for (let x = cx - 12; x <= cx - 6; x++) {
    const i = y * W + x;
    if (inB(w, x, y) && w.ground[i] === 2 && rand(r) < F.groveDensity) w.tree[i] = 2;
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (Math.hypot(x + 0.5 - cx, (y + 0.5 - cy) * 1.2) < M.start.clearRadius) w.tree[y * W + x] = 0;
  return w;
}

/**
 * A new island with the starting settlement at its centre: a storage yard, two houses and a short road.
 * `settlements` above 1 founds neighbours the same way, as far apart as the land allows.
 * The village planner is off unless `planner` is set, so scripted scenarios stay scripted.
 */
export interface WorldOptions { planner?: boolean; settlements?: number; map?: string; size?: string }

export function createState(content: Content, seed: number, opts: WorldOptions = {}): State {
  const S = {
    content, seed, rng: makeRng(seed), krng: makeRng(seed ^ 0x6b6e6f77), t: 0, buildings: [], agents: [], bmap: new Map(), amap: new Map(), nextId: 1,
    mood: 1, migT: 0, secT: 0, events: [], towns: [],
    stats: { made: {}, deliveries: { villager: 0, bot: 0 }, arrivals: 0, departures: 0, peakVillagers: 0, invented: 0, taught: 0, forgotten: 0 },
  } as unknown as State;
  const mt = content.tuning.map;
  const mapId = opts.map ?? mt.standardType, sizeId = opts.size ?? mt.standardSize;
  const M = content.maps[mapId], size = mt.sizes[sizeId];
  if (!M) throw new Error(`unknown map type "${mapId}"`);
  if (!size) throw new Error(`unknown map size "${sizeId}"`);
  S.setup = { map: mapId, size: sizeId, settlements: opts.settlements ?? 1 };
  S.world = generateWorld(M, size.width, size.height, S);
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
  const town: Town = { id, name: t.names[id % t.names.length], store: store.id, knows: foundersKnowledge(content), planner: plannerOn(planner), haul: 0, mood: 1, visitT: 0 };
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
    // as far as possible up to `neighbour_spacing`; past that, room to grow decides
    const spread = Math.floor(Math.min(d, t.neighbourSpacing));
    if (d < t.neighbourMinDistance || spread < bestD) continue;
    let ok = true;
    for (let y = cy - 2; y <= cy + 3 && ok; y++) for (let x = cx - 6; x <= cx + 5; x++) {
      const i = y * w.w + x;
      if (!inB(w, x, y) || w.ground[i] !== 2 || w.bgrid[i] !== -1 || w.road[i]) { ok = false; break; }
    }
    if (!ok) continue;
    let room = 0;
    for (let y = cy - 8; y <= cy + 8; y++) for (let x = cx - 8; x <= cx + 8; x++) if (inB(w, x, y) && w.ground[y * w.w + x] === 2) room++;
    if (spread === bestD && room <= bestRoom) continue;
    if (!findPath(w, home.x, home.y, cx, cy + 1)) continue;
    bestD = spread; bestRoom = room; best = { x: cx, y: cy };
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

/**
 * Why `type` cannot go here, or null if it can. Every tile must be open land, the building
 * must not cover another building's door front, and its own door front must be open land too.
 */
export function placeProblem(S: State, type: string, x: number, y: number): string | null {
  const B = S.content.blueprints[type], w = S.world;
  if (!B) return 'unknown building';
  for (let j = y; j < y + B.h; j++) for (let k = x; k < x + B.w; k++) {
    if (!inB(w, k, j)) return 'off the edge of the map';
    const i = j * w.w + k;
    if (!w.ground[i]) return 'that is water';
    if (w.bgrid[i] !== -1) return 'something is already built there';
    if (B.paves) { if (w.road[i]) return 'there is a road already'; continue; }
    if (w.front[i]) return "it would block another building's door";
  }
  if (!B.paves) {
    const d = door({ x, y, w: B.w, h: B.h }), fy = d.y + 1;
    if (!inB(w, d.x, fy) || !w.ground[fy * w.w + d.x] || w.bgrid[fy * w.w + d.x] !== -1) return 'its door would open onto nothing';
  }
  return null;
}

export const canPlace = (S: State, type: string, x: number, y: number) => placeProblem(S, type, x, y) === null;

/**
 * Anyone standing where a new building goes steps out to its door front, and anyone whose
 * route crosses it finds a new one.
 */
function stepOut(S: State, b: Building) {
  const d = door(b), inFoot = (x: number, y: number) => x >= b.x && y >= b.y && x < b.x + b.w && y < b.y + b.h;
  for (const a of S.agents) {
    const inside = inFoot(Math.floor(a.x), Math.floor(a.y));
    if (!inside && !a.path.some(([x, y]) => inFoot(x, y) && !(x === d.x && y === d.y))) continue;
    if (inside) { a.x = d.x + 0.5; a.y = d.y + 1.5; }
    a.path = [];
    const t = a.task, to = a.state === 'toSrc' ? t?.src : a.state === 'toDst' ? t?.dst : a.state === 'toWork' ? a.work : a.state === 'visit' && a.visit ? S.bmap.get(S.towns[a.visit.back ? a.visit.from : a.visit.to].store) : null;
    if (to && !to.dead) goToBuilding(S, a, to);
    else if (a.state === 'wander') a.state = 'idle';
  }
}

/** Mark or clear a building's door and the open tile in front of it. */
function setDoor(S: State, b: Building, on: boolean) {
  const w = S.world, d = door(b), i = d.y * w.w + d.x, f = (d.y + 1) * w.w + d.x;
  w.door[i] = on ? 1 : 0;
  if (inB(w, d.x, d.y + 1)) w.front[f] = Math.max(0, w.front[f] + (on ? 1 : -1));
}

/** Place a building (or a road tile). New buildings start as construction sites unless `complete`. */
export function placeBuilding(S: State, type: string, x: number, y: number, complete: boolean): Building | null {
  const B = S.content.blueprints[type], w = S.world;
  if (B.paves) { const i = y * w.w + x; w.road[i] = 1; w.tree[i] = 0; return null; }
  const b: Building = {
    id: S.nextId++, type, x, y, w: B.w, h: B.h, site: !complete, build: 0, inv: {}, incoming: {}, reserved: {},
    worker: null, timer: 0, plantT: 0, paused: false, status: { t: '', l: 'ok' }, residents: [], eat: 0, hunger: 0, bots: [], dead: false, priority: 0, reason: '', town: nearestTown(S, x + B.w / 2, y + B.h / 2), used: 0, waiting: {},
  };
  for (let j = y; j < y + B.h; j++) for (let k = x; k < x + B.w; k++) { const i = j * w.w + k; w.bgrid[i] = b.id; w.tree[i] = 0; w.road[i] = 0; }
  setDoor(S, b, true);
  S.buildings.push(b); S.bmap.set(b.id, b);
  stepOut(S, b);
  if (complete) completeSite(S, b, false);
  return b;
}

export function completeSite(S: State, b: Building, announce: boolean) {
  b.site = false; b.build = 0; b.inv = {}; b.incoming = {}; b.reserved = {}; b.waiting = {};
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
  setDoor(S, b, false);
  for (const a of S.agents) if (a.work === b) { a.work = null; a.role = 'carrier'; a.state = 'idle'; a.path = []; }
  const gone = b.residents.length;
  for (const id of [...b.residents]) { const a = S.amap.get(id); if (a) { removeAgent(S, a); S.stats.departures++; } }
  for (const id of b.bots) { const a = S.amap.get(id); if (a) removeAgent(S, a); }
  if (gone) emit(S, 'bad', `${gone} villager${gone > 1 ? 's' : ''} left: their home was demolished`);
}
