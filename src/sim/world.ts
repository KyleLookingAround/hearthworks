import { makeRng, rand, valueNoise, type Rng } from './rng.ts';
import { goToBuilding, makeAgent, moveTo, removeAgent } from './agents.ts';
import { plannerOn } from './planner.ts';
import { foundersKnowledge } from './knowledge.ts';
import { initPeople } from './people.ts';
import { joinFields, offered } from './farms.ts';
import { setBelt, turned } from './belts.ts';
import { findPath, reachable, reshaped } from './path.ts';
import { islesOf, shapeSea } from './sea.ts';
import { launch } from './ships.ts';
import type { Agent, BlueprintDef, Learning, Building, Content, GameEvent, Ledger, MapDef, State, Town, World } from './types.ts';

/**
 * A place of learning of this kind in a settlement: standing, or with `working` its worker at work.
 * A library keeps knowledge just by standing; a school, a university and a printing house need their teacher, scholar or printer.
 */
export function learningAt(S: State, town: number, kind: Learning, working = kind !== 'library'): boolean {
  return S.buildings.some(b => {
    if (b.town !== town || b.site || S.content.blueprints[b.type].learning !== kind) return false;
    if (!working) return true;
    const w = b.worker !== null ? S.amap.get(b.worker) : undefined;
    return !!w && w.state === 'working';
  });
}

/** Can this villager read: schooled as a child, or grown in a settlement whose printing house has its printer at work (books in every home)? */
export const reads = (S: State, a: Agent, printed = !!a.home && learningAt(S, a.home.town, 'press')) => a.role !== 'child' && (a.schooled || printed);

/** A new settlement's trade ledger. */
export const newLedger = (): Ledger => ({ t: 0, imports: {}, made: {}, exported: {}, imported: {}, waits: {} });

export const inB = (w: World, x: number, y: number) => x >= 0 && y >= 0 && x < w.w && y < w.h;
/** The way each facing looks: 0 south, 1 west, 2 north, 3 east. */
export const FACING: readonly (readonly [number, number])[] = [[0, 1], [-1, 0], [0, -1], [1, 0]];
/** A blueprint's footprint turned to a facing: a quarter turn swaps its width and height. */
export const dims = (B: { w: number; h: number }, rot = 0) => (rot % 2 ? { w: B.h, h: B.w } : { w: B.w, h: B.h });
type Placed = { x: number; y: number; w: number; h: number; rot?: number; doorAt?: { x: number; y: number } | null };
/**
 * The door: the middle of the side the building faces (the bottom row, facing south), where the south door lands when
 * the building is turned about its centre. The tile beyond it (the door front) must stay open.
 */
export const door = (b: Placed) => {
  if (b.doorAt) return b.doorAt;
  switch (b.rot ?? 0) {
    case 1: return { x: b.x, y: b.y + Math.floor(b.h / 2) };
    // turned half way or three quarters, the door stays where the turned building's south door was (mirrored on an even side)
    case 2: return { x: b.x + b.w - 1 - Math.floor(b.w / 2), y: b.y };
    case 3: return { x: b.x + b.w - 1, y: b.y + b.h - 1 - Math.floor(b.h / 2) };
    default: return { x: b.x + Math.floor(b.w / 2), y: b.y + b.h - 1 };
  }
};
/** The door front: the tile beyond the door, the way the building faces. */
export const front = (b: Placed) => { const d = door(b), f = FACING[b.rot ?? 0]; return { x: d.x + f[0], y: d.y + f[1] }; };
/** Beside the door, to its left as one looks out (east of a dock facing south): where people reach a dock that opens onto water. */
export const beside = (b: Placed) => { const d = door(b), f = FACING[b.rot ?? 0]; return { x: d.x + f[1], y: d.y - f[0] }; };
/**
 * The length of (x, y), exactly as V8's Math.hypot gives it (the same scaling by the larger and Kahan sum of squares,
 * step for step: tests/sim.test.ts checks every bit), without the array Math.hypot allocates for its arguments on every
 * call. The sim measures many distances.
 */
export function hypot(x: number, y: number): number {
  const ax = Math.abs(x), ay = Math.abs(y);
  if (ax === Infinity || ay === Infinity) return Infinity;
  if (ax !== ax || ay !== ay) return NaN;
  const max = ax > ay ? ax : ay;
  if (max === 0) return 0;
  const a = ax / max, b = ay / max;
  let sum = 0, comp = 0, s = a * a - comp, p = sum + s;
  comp = (p - sum) - s; sum = p;
  s = b * b - comp; p = sum + s;
  comp = (p - sum) - s; sum = p;
  return Math.sqrt(sum) * max;
}
export const ctr = (b: { x: number; y: number; w: number; h: number }) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });
export const distAB = (a: { x: number; y: number }, b: Building) => { const p = ctr(b); return hypot(a.x - p.x, a.y - p.y); };
export const distBB = (a: Building, b: Building) => { const p = ctr(a), q = ctr(b); return hypot(p.x - q.x, p.y - q.y); };
export const add = (o: Record<string, number>, k: string, v: number) => { o[k] = (o[k] || 0) + v; if (Math.abs(o[k]) < 1e-9) o[k] = 0; };
export const bp = (S: State, b: Building) => S.content.blueprints[b.type];
export const villagers = (S: State): Agent[] => S.agents.filter(a => a.kind === 'villager');
export const hasBuilt = (S: State, type: string) => S.buildings.some(b => b.type === type && !b.site);
export const countBuilt = (S: State, type: string) => S.buildings.filter(b => b.type === type && !b.site).length;

export type Season = 'spring' | 'summer' | 'autumn' | 'winter';
const SEASONS: Season[] = ['spring', 'summer', 'autumn', 'winter'];

/** The season now, or null with seasons off. The year opens in spring; each season is a quarter of `year_seconds`. */
export function seasonOf(S: State): Season | null {
  if (!S.seasons) return null;
  const Y = S.content.tuning.seasons.yearSeconds;
  return SEASONS[Math.floor(((S.t % Y) / Y) * 4) % 4];
}

/**
 * Is a settlement's winter store on track, counting `extra` more mouths? From the start of summer to the
 * first frost, the grain, bread and preserved food in its stores must keep pace with the winter's meals and
 * `winter_headroom` more: none at the start of summer, half at its end, all by the frost. Through the winter,
 * what is left must cover what is left of it. Always true without seasons. `spend` counts that much less in store.
 */
export function storesOnTrack(S: State, t: Town, extra = 0, spend = 0): boolean {
  if (!S.seasons) return true;
  const Z = S.content.tuning.seasons, phase = (S.t % Z.yearSeconds) / Z.yearSeconds;
  // (`spend`: that much less in store, as when a founding party takes its provisions)
  let stored = -spend, pop = extra;
  for (const b of S.buildings) if (b.town === t.id && bp(S, b).storage && !b.site) for (const g of ['wheat', 'bread', ...Z.preserved]) stored += b.inv[g] || 0;
  for (const a of S.agents) if (a.kind === 'villager' && a.home?.town === t.id) pop++;
  const meals = (seconds: number) => (pop * seconds) / S.content.tuning.needs.eatEverySeconds;
  if (phase >= 0.75) return stored >= meals((1 - phase) * Z.yearSeconds);
  return stored >= meals(Z.yearSeconds / 4) * Z.winterHeadroom * Math.max(0, (phase - 0.25) / 0.5);
}

/** The foods a home eats, in order: its own (bread), with farms that grow the foods of the diet, then the preserved foods when seasons are on. */
export function foodsOf(S: State, b: Building): string[] {
  const f = Object.keys(bp(S, b).keepStocked)[0];
  return f ? [f, ...(S.farms ? S.content.tuning.farms.diet : []), ...(S.seasons ? S.content.tuning.seasons.preserved : [])] : [];
}

/** Write a line of a settlement's history. */
export function chronicle(S: State, town: number, kind: string, text: string) {
  S.chronicle.push({ t: S.t, town, kind, text });
}

export function emit(S: State, kind: GameEvent['kind'], text: string, minor = false) {
  S.events.push({ kind, text, t: S.t, minor });
  if (S.events.length > 200) S.events.splice(0, S.events.length - 200);
}

/**
 * Generate a world of the given type and size. Island at the standard size reproduces the
 * original island exactly (same numbers, same random draws in the same order).
 */
function generateWorld(M: MapDef, W: number, H: number, S: State): World {
  const r = S.rng, N = W * H, T = M.terrain, F = M.forest;
  const w: World = { w: W, h: H, ground: new Uint8Array(N), height: new Uint8Array(N), deposit: new Uint8Array(N), slopeCost: 0, rockCost: 1, pathCost: 1, roadCost: 1, stoneCost: 1, roads: 0, stone: 0, forestCost: 1, wear: new Float32Array(N), bridge: new Uint8Array(N), zone: new Uint8Array(N), tree: new Uint8Array(N), grow: new Float32Array(N), road: new Uint8Array(N), belt: new Uint8Array(N), belts: 0, bgrid: new Int32Array(N).fill(-1), door: new Uint8Array(N), front: new Uint8Array(N), dock: new Uint8Array(N), docks: 0, waterCost: 1, sea: new Uint8Array(N), shallowCost: 1, work: { paths: 0, pathFails: 0, pathNodes: 0, jobPairs: 0, plannerSpots: 0 } };
  const n1 = valueNoise(r, T.largeCell, W, H), n2 = valueNoise(r, T.smallCell, W, H), n3 = valueNoise(r, F.cell, W, H);
  // island centres for the islands shape, and islets out at sea: drawn only for maps that have them,
  // so the lone isle draws exactly the random numbers it always did
  const half = Math.min(W, H) / 2, blobs: { x: number; y: number; r: number }[] = [];
  if (M.shape === 'islands' && M.islands) {
    const I = M.islands;
    // islands keep their size on bigger maps; there are more of them, in proportion to the area
    const scale = Math.min(half, I.scaleTiles), more = Math.min(I.countCap, Math.max(1, (W * H) / (4 * scale * scale * 1.4)));
    const n = Math.round((I.countMin + Math.floor(rand(r) * (I.countMax - I.countMin + 1))) * (half > I.scaleTiles ? more : 1));
    for (let k = 0, tries = 0; k < n && tries < 400 * Math.max(1, n / I.countMax); tries++) {
      const rad = Math.min(half - 3, Math.max(I.minTiles, scale * (I.radiusMin + rand(r) * (I.radiusMax - I.radiusMin))));
      const bx = rad + 2 + rand(r) * (W - 2 * rad - 4), by = rad + 2 + rand(r) * (H - 2 * rad - 4);
      // keep a channel of sea between islands
      if (blobs.some(o => hypot(o.x - bx, o.y - by) < (o.r + rad) * 1.05)) continue;
      blobs.push({ x: bx, y: by, r: rad }); k++;
    }
  }
  for (let k = 0; k < M.islets; k++) {
    const rad = half * (0.08 + rand(r) * 0.08);
    const bx = W * (M.shape === 'coast' ? M.coastline + 0.12 + rand(r) * (0.82 - M.coastline) : rand(r)), by = rad + rand(r) * (H - 2 * rad);
    blobs.push({ x: bx, y: by, r: rad });
  }
  const nearestBlob = (x: number, y: number) => blobs.reduce((m, o) => Math.min(m, ((x + 0.5 - o.x) ** 2 + (y + 0.5 - o.y) ** 2) / (o.r * o.r)), Infinity);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, dx = (x + 0.5 - W / 2) / (W / 2), dy = (y + 0.5 - H / 2) / (H / 2), radial = dx * dx + dy * dy;
    let d = radial;
    if (M.shape === 'landmass') d = 0;
    else if (M.shape === 'coast') { const s = Math.max(0, (x + 0.5) / W - M.coastline) / (1 - M.coastline); d = s * s * 4; }
    else if (M.shape === 'islands') d = nearestBlob(x, y);
    if (M.islets && M.shape !== 'islands') d = Math.min(d, nearestBlob(x, y));
    let h = T.large * n1(x, y) + T.small * n2(x, y) + T.base - T.falloff * d;
    if (radial < M.start.landRadius) h = Math.max(h, 0.7);
    const border = x === 0 || y === 0 || x === W - 1 || y === H - 1;
    w.ground[i] = (border && M.shores.seaBorder) ? 0 : h > M.shores.grass ? 2 : h > M.shores.sand ? 1 : 0;
    if (w.ground[i]) w.height[i] = Math.max(0, Math.min(255, Math.round((h - M.shores.sand) * 320)));
    if (w.ground[i] === 2 && M.mountains && h > M.mountains.level) w.ground[i] = 3;
  }
  for (let k = 0; k < M.rivers.count; k++) carveRiver(w, r, M.rivers.width);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (w.ground[i] === 2 && ((n3(x, y) > F.threshold && rand(r) < F.density) || rand(r) < F.scatter)) w.tree[i] = 2;
  }
  for (let i = 0; i < N; i++) if (!w.ground[i]) w.height[i] = 0;
  placeDeposits(w, M, S.seed);
  shapeSea(w, M, S.seed, S.content.tuning.sea);
  return w;
}

/**
 * Deposits from their own random stream (so adding them moved nothing else): fertile soil in patches of
 * grass, stone on and beside rock (outcrops where there are no mountains), clay on banks beside water,
 * and fish in water near land. Patches follow smooth noise, so they come in clumps.
 */
function placeDeposits(w: World, M: MapDef, seed: number) {
  const r = makeRng(seed ^ 0x6465706f), W = w.w, H = w.h, D = M.deposits;
  const soil = valueNoise(r, 7, W, H), rock = valueNoise(r, 5, W, H), mud = valueNoise(r, 4, W, H), shoal = valueNoise(r, 6, W, H), ore = valueNoise(r, 5, W, H);
  const near = (x: number, y: number, g: number, R: number) => {
    for (let j = -R; j <= R; j++) for (let k = -R; k <= R; k++) { const xx = x + k, yy = y + j; if (xx >= 0 && yy >= 0 && xx < W && yy < H && w.ground[yy * W + xx] === g) return true; }
    return false;
  };
  // a share `p` of tiles kept: noise above the matching level of a roughly even spread
  const keep = (v: number, p: number) => v > 1 - p;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, g = w.ground[i];
    if (g === 2 && keep(soil(x, y), D.fertile)) w.deposit[i] = 1;
    else if ((g === 3 || (g && near(x, y, 3, 1))) && keep(rock(x, y), M.mountains ? 0.6 : 0)) w.deposit[i] = 2;
    else if (g === 2 && !M.mountains && keep(rock(x, y), D.stone)) w.deposit[i] = 2;
    else if (g && g !== 3 && near(x, y, 0, 1) && keep(mud(x, y), D.clay)) w.deposit[i] = 3;
    else if (!g && near(x, y, 2, 3) && keep(shoal(x, y), D.fish)) w.deposit[i] = 4;
    // iron: veins in rock, and small outcrops in grass where there are no mountains (drawn last, so the rest stay put)
    if (((g === 3 && keep(ore(x, y), 0.3)) || (g === 2 && !M.mountains && keep(ore(x, y), D.iron))) && w.deposit[i] !== 4) w.deposit[i] = 5;
  }
}

/** A river from one edge of the map to the opposite one, wandering as it goes, with sandy banks. */
function carveRiver(w: World, r: Rng, width: number) {
  const across = rand(r) < 0.5, len = across ? w.w : w.h, span = across ? w.h : w.w;
  let pos = span * (0.2 + rand(r) * 0.6), drift = 0;
  for (let s = 0; s < len; s++) {
    drift = Math.max(-1, Math.min(1, drift + (rand(r) - 0.5) * 0.5));
    pos = Math.max(2, Math.min(span - 3, pos + drift));
    for (let o = -width; o <= width; o++) {
      const p = Math.round(pos) + o, x = across ? s : p, y = across ? p : s;
      if (!inB(w, x, y)) continue;
      const i = y * w.w + x;
      if (Math.abs(o) < width) w.ground[i] = 0;
      else if (w.ground[i] === 2) w.ground[i] = 1;
    }
  }
}

/** Ready a settlement's ground: a grove planted north-west of it so it can start a wood chain, and its centre cleared. */
/** Clear the trees off a new settlement's layout (a founding party's first work). */
export function clearSite(S: State, M: MapDef, cx: number, cy: number) {
  const w = S.world, W = w.w;
  for (let y = Math.max(0, cy - 8); y <= Math.min(w.h - 1, cy + 8); y++) for (let x = Math.max(0, cx - 8); x <= Math.min(W - 1, cx + 8); x++) {
    if (hypot(x + 0.5 - cx, (y + 0.5 - cy) * 1.2) < M.start.clearRadius) w.tree[y * W + x] = 0;
  }
}

function prepareSite(S: State, M: MapDef, cx: number, cy: number) {
  const w = S.world, W = w.w;
  for (let y = cy - 8; y <= cy - 3; y++) for (let x = cx - 12; x <= cx - 6; x++) {
    const i = y * W + x;
    if (inB(w, x, y) && w.ground[i] === 2 && w.bgrid[i] === -1 && rand(S.rng) < M.forest.groveDensity) w.tree[i] = 2;
  }
  for (let y = Math.max(0, cy - 8); y <= Math.min(w.h - 1, cy + 8); y++) for (let x = Math.max(0, cx - 8); x <= Math.min(W - 1, cx + 8); x++) {
    if (hypot(x + 0.5 - cx, (y + 0.5 - cy) * 1.2) < M.start.clearRadius) w.tree[y * W + x] = 0;
  }
}

/** Running sums of a tile test over the map, so any rectangle's count is four lookups. Out-of-map tiles count 0. */
function sums(w: World, test: (i: number) => boolean) {
  const W = w.w + 1, t = new Int32Array(W * (w.h + 1));
  for (let y = 0; y < w.h; y++) for (let x = 0, row = 0; x < w.w; x++) { row += test(y * w.w + x) ? 1 : 0; t[(y + 1) * W + x + 1] = t[y * W + x + 1] + row; }
  return (x0: number, y0: number, x1: number, y1: number) => {
    x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(w.w - 1, x1); y1 = Math.min(w.h - 1, y1);
    if (x0 > x1 || y0 > y1) return 0;
    return t[(y1 + 1) * W + x1 + 1] - t[y0 * W + x1 + 1] - t[(y1 + 1) * W + x0] + t[y0 * W + x0];
  };
}

/**
 * Site tests over the land as it is now: does the starting layout (storage, a house each side, a road) fit
 * around (cx, cy) on open grass with a margin; grass within 8 (room to grow); grown trees within 10 (wood
 * close enough to start a wood chain).
 */
function siteTests(w: World) {
  const open = sums(w, i => w.ground[i] === 2 && w.bgrid[i] === -1 && !w.road[i]);
  const grass = sums(w, i => w.ground[i] === 2), trees = sums(w, i => w.tree[i] === 2);
  return {
    layoutFits: (cx: number, cy: number) => cx - 6 >= 0 && cy - 2 >= 0 && cx + 5 < w.w && cy + 3 < w.h && open(cx - 6, cy - 2, cx + 5, cy + 3) === 72,
    roomAround: (cx: number, cy: number) => grass(cx - 8, cy - 8, cx + 8, cy + 8),
    woodAround: (cx: number, cy: number) => trees(cx - 10, cy - 10, cx + 10, cy + 10),
  };
}

/**
 * Where the first settlement starts, chosen by the seed. Each spot where the starting layout fits
 * scores its room to grow plus `start_wood_weight` per tree nearby; of the spots scoring at least
 * `start_room_share` of the best, the seed picks one.
 */
function firstSite(S: State): { x: number; y: number } {
  const w = S.world, T = S.content.tuning.start, share = T.startRoomShare;
  const { layoutFits, roomAround, woodAround } = siteTests(w);
  const spots: { x: number; y: number; room: number }[] = [];
  let best = 0;
  for (let cy = 4; cy < w.h - 5; cy++) for (let cx = 8; cx < w.w - 7; cx++) {
    if (!layoutFits(cx, cy)) continue;
    const room = roomAround(cx, cy) + T.startWoodWeight * woodAround(cx, cy);
    spots.push({ x: cx, y: cy, room }); best = Math.max(best, room);
  }
  const good = spots.filter(s => s.room >= best * share);
  if (!good.length) return { x: Math.floor(w.w / 2), y: Math.floor(w.h / 2) };
  return good[Math.floor(rand(S.rng) * good.length)];
}

/**
 * A new island with the starting settlement at its centre: a storage yard, two houses and a short road.
 * `settlements` above 1 founds neighbours the same way, as far apart as the land allows.
 * The village planner is off unless `planner` is set, so scripted scenarios stay scripted.
 */
export interface WorldOptions { /** the year turns (default off, for scenarios that predate seasons) */ seasons?: boolean; /** neighbours trade (default off, for scenarios that predate it) */ trade?: boolean; /** villagers age, are born and die, learn, and honour their dead (default off) */ people?: boolean; /** cart sheds and handcarts (default off) */ carts?: boolean; /** crowded settlements found daughter towns (default off) */ settlers?: boolean; /** settlements know only the islands they have charted, and send explorers (default off) */ charts?: boolean; /** fire, flood, sickness and barbarians (default off) */ hardship?: boolean; /** settlements think of roads and lay them in straight strips (default off) */ plannedRoads?: boolean; /** newcomers arrive (default on) */ newcomers?: boolean; /** farms grow fields and hands, and homes eat a varied diet (default off) */ farms?: boolean; /** boats belong to settlements, one with each dock and more from shipyards (default off) */ ships?: boolean; /** planners pave worn paths (default on) */ roads?: boolean; planner?: boolean; settlements?: number; map?: string; size?: string }

export function createState(content: Content, seed: number, opts: WorldOptions = {}): State {
  const S = {
    content, seed, rng: makeRng(seed), krng: makeRng(seed ^ 0x6b6e6f77), t: 0, buildings: [], agents: [], bmap: new Map(), amap: new Map(), nextId: 1,
    mood: 1, fed: 1, migT: 0, secT: 0, events: [], towns: [], chronicle: [], seasons: false, trade: false,
    stats: { made: {}, trades: 0, births: 0, deaths: 0, honoured: 0, riteWaitMax: 0, feasts: 0, feastsMissed: 0, cartDeliveries: 0, goodsDelivered: 0, longGoods: 0, longGoodsByCart: 0, longFootSeconds: 0, longCartSeconds: 0, longDeliveries: 0, longByCart: 0, oxTrips: 0, longGoodsByOx: 0, longOxSeconds: 0, deliverySeconds: 0, delivered: 0, deliveryTiles: 0, replanned: 0, demolitionDepartures: 0, spoiled: 0, deliveries: { villager: 0, bot: 0 }, arrivals: 0, departures: 0, peakVillagers: 0, eaten: {}, grown: 0, invented: 0, taught: 0, forgotten: 0, fires: 0, burnt: 0, floods: 0, outbreaks: 0, raids: 0, repelled: 0, looted: 0, sickDeaths: 0, starved: 0, camps: 0, gifts: 0, campsSettled: 0, barbariansSettled: 0, voyages: 0, charted: 0, roadsLaid: 0, roadTiles: 0, roadCut: 0, roadMoved: 0, roadDeliveries: 0, roadDeliverySeconds: 0, roadDeliveryTiles: 0, pathDeliveries: 0, pathDeliverySeconds: 0, pathDeliveryTiles: 0, beltsLaid: 0, beltTiles: 0, beltLoads: 0, beltGoods: 0, beltSeconds: 0, boatsBuilt: 0, boatTrips: 0, ashore: 0 },
    parcels: [], boats: [],
  } as unknown as State;
  const mt = content.tuning.map;
  const mapId = opts.map ?? mt.standardType, sizeId = opts.size ?? mt.standardSize;
  const M = content.maps[mapId], size = mt.sizes[sizeId];
  if (!M) throw new Error(`unknown map type "${mapId}"`);
  if (!size) throw new Error(`unknown map size "${sizeId}"`);
  if (M.sizes && !M.sizes.includes(sizeId)) throw new Error(`${M.name} is not offered at size "${sizeId}"`);
  S.setup = { map: mapId, size: sizeId, settlements: opts.settlements ?? 1 };
  S.seasons = opts.seasons ?? false;
  S.trade = opts.trade ?? false;
  S.people = opts.people ?? false;
  S.carts = opts.carts ?? false;
  S.settlers = opts.settlers ?? false;
  S.charts = opts.charts ?? false;
  S.newcomers = opts.newcomers ?? true;
  S.prng = makeRng(seed ^ 0x70656f70);
  S.hardship = opts.hardship ?? false;
  S.plannedRoads = opts.plannedRoads ?? false;
  S.farms = opts.farms ?? false;
  S.ships = opts.ships ?? false;
  S.hrng = makeRng(seed ^ 0x68617264);
  S.camps = []; S.campT = 0;
  S.world = generateWorld(M, size.width, size.height, S);
  const L = content.tuning.logistics;
  S.world.waterCost = L.villagerSpeed / L.boatSpeed; S.world.shallowCost = 1 / content.tuning.sea.shallowSpeed;
  S.world.slopeCost = L.slopeCost; S.world.rockCost = L.rockCost;
  S.world.pathCost = 1 / L.pathSpeed; S.world.roadCost = 1 / L.roadSpeed; S.world.stoneCost = 1 / L.stoneRoadSpeed; S.world.forestCost = 1 / L.forestSpeed;
  const first = firstSite(S);
  prepareSite(S, M, first.x, first.y);
  foundTown(S, first.x, first.y, opts.planner ?? false, opts.roads ?? true);
  for (let k = 1; k < (opts.settlements ?? 1); k++) {
    const at = neighbourSite(S);
    if (!at) break;
    prepareSite(S, M, at.x, at.y);
    foundTown(S, at.x, at.y, opts.planner ?? false, opts.roads ?? true);
  }
  S.planner = S.towns[0].planner;
  if (S.people) initPeople(S);
  S.stats.peakVillagers = villagers(S).length;
  return S;
}

/** Lay out a settlement around (cx, cy): storage, a house either side, a road and the starting villagers. */
export function foundTown(S: State, cx: number, cy: number, planner: boolean, roads: boolean, party?: Agent[]): Town {
  const content = S.content, t = content.tuning.start, W = S.world.w;
  const id = S.towns.length;
  const store = placeBuilding(S, 'storage', cx - 1, cy - 1, true)!;
  store.inv = { ...t.storage };
  const town: Town = { id, name: t.names[id % t.names.length], store: store.id, knows: foundersKnowledge(content, B => offered(S, B)), planner: { ...plannerOn(planner), roads }, haul: 0, cut: 0, fed: 1, mood: 1, visitT: 0, detour: 0, detours: [], districts: [store.id], streets: [], levers: { priority: {}, encourage: null, pace: 1 }, form: 'hamlet', trade: newLedger(), custom: 'burial', naming: 'fields', rites: [], feasts: [], feastUntil: -1e9, graves: {}, copyT: 0, reach: 0, mother: null, overseas: false, age: 0, laws: { rationing: false, hours: 'normal', leave: true }, struck: {}, roadT: 0, roads: [], beltT: 0, belts: [], sentAt: -1e9, settleT: 0, charted: [], lookT: 1e9, explore: false, voyageAt: -1e9, boatless: -1e9 };
  S.towns.push(town);
  if (!party) chronicle(S, id, 'founded', `${town.name} was founded with ${t.villagers} villagers`);
  const h1 = placeBuilding(S, 'house', cx - 5, cy - 1, true)!, h2 = placeBuilding(S, 'house', cx + 3, cy - 1, true)!;
  for (const b of [store, h1, h2]) b.town = id;
  h1.inv = { ...t.houseStock }; h2.inv = { ...t.houseStock };
  for (let x = cx - 5; x <= cx + 4; x++) if (S.world.ground[(cy + 2) * W + x] && S.world.road[(cy + 2) * W + x] < 2) { S.world.road[(cy + 2) * W + x] = 1; S.world.tree[(cy + 2) * W + x] = 0; }
  const homes = [h1, h2], cap = content.blueprints.house.homes;
  // a founding party moves in rather than new villagers
  if (party) {
    for (const a of party) {
      const home = homes.find(h => h.residents.length < cap);
      if (a.home) a.home.residents = a.home.residents.filter(r => r !== a.id);
      a.home = home ?? null;
      if (home) home.residents.push(a.id);
    }
    return town;
  }
  for (let k = 0; k < t.villagers; k++) {
    const home = homes.find(h => h.residents.length < cap);
    const a = makeAgent(S, 'villager', cx - 1.5 + (k % 5), cy + 2.5);
    if (home) { a.home = home; home.residents.push(a.id); }
  }
  return town;
}

/**
 * Where a neighbour can settle, chosen by the seed: the whole starting layout on open grass,
 * at least `neighbour_min_distance` from every settlement, with `neighbour_min_room` to grow,
 * and reachable on foot unless the map allows neighbours across water. Spots count as far enough
 * apart when their distance to the nearest settlement (capped at `neighbour_spacing`) is at least
 * `neighbour_spread_share` of the best; of those, the seed picks one scoring at least
 * `start_room_share` of the best on room and wood, as for the first settlement.
 * Null if the land has no room.
 */
export function neighbourSite(S: State, from: Town = S.towns[0], reach = false, charted = false): { x: number; y: number } | null {
  const w = S.world, t = S.content.tuning.start;
  const centres = S.towns.map(tn => ctr(S.bmap.get(tn.store)!));
  const home = door(S.bmap.get(from.store)!);
  const { layoutFits, roomAround, woodAround } = siteTests(w);
  const spots: { x: number; y: number; spread: number; score: number }[] = [];
  for (let cy = 3; cy < w.h - 4; cy++) for (let cx = 7; cx < w.w - 6; cx++) {
    let d = Infinity;
    for (const c of centres) d = Math.min(d, hypot(cx - c.x, cy - c.y));
    if (d < t.neighbourMinDistance || !layoutFits(cx, cy)) continue;
    const room = roomAround(cx, cy);
    // never found a village where it has no room to live
    if (room < t.neighbourMinRoom) continue;
    spots.push({ x: cx, y: cy, spread: Math.min(d, t.neighbourSpacing), score: room + t.startWoodWeight * woodAround(cx, cy) });
  }
  // with `charted`, only on islands `from` has charted: a party chooses among the land it knows of
  const isle = charted ? islesOf(S).id : null, known = new Set(from.charted);
  const mapped = isle ? spots.filter(p => known.has(isle[(p.y + 1) * w.w + p.x])) : spots;
  const far = mapped.reduce((m, p) => Math.max(m, p.spread), 0) * t.neighbourSpreadShare;
  const apart = mapped.filter(p => p.spread >= far);
  const top = apart.reduce((m, p) => Math.max(m, p.score), 0) * t.startRoomShare;
  const good = apart.filter(p => p.score >= top);
  const onFoot = S.content.maps[S.setup.map].neighbours === 'reachable', test = onFoot || reach;
  // what can be walked to is found once; only with docks can a route search reach more (by boat), and a search
  // that fails covers the whole map, so without them the sites out of reach are never searched for
  const foot = test ? reachable(w, home.x, home.y) : null;
  const walks = (p: { x: number; y: number }) => !!foot && foot[(p.y + 1) * w.w + p.x] === 1;
  // with ships on, only the settlement's own docks launch its boats
  const docks = S.ships ? S.buildings.some(b => b.town === from.id && !b.site && bp(S, b).shore) : w.docks > 0;
  const left = test && !docks ? good.filter(walks) : good;
  while (left.length) {
    const k = Math.floor(rand(S.rng) * left.length), p = left[k];
    // with `reach`, the site must be reachable from `from`: on foot, or rowing from a dock
    if (!test || walks(p) || findPath(w, home.x, home.y, p.x, p.y + 1, S.ships ? { fleet: from.id } : {})) return { x: p.x, y: p.y };
    left.splice(k, 1);
  }
  return null;
}

/** The settlement whose first storage yard is nearest to a point. */
export function nearestTown(S: State, x: number, y: number): number {
  let best = 0, bd = Infinity;
  for (const tn of S.towns) {
    const s = S.bmap.get(tn.store);
    if (!s) continue;
    const c = ctr(s), d = hypot(c.x - x, c.y - y);
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
export function placeProblem(S: State, type: string, x: number, y: number, rot = 0): string | null {
  const B = S.content.blueprints[type], w = S.world;
  if (!B) return 'unknown building';
  const { w: bw, h: bh } = B.paves ? { w: 1, h: 1 } : dims(B, rot);
  for (let j = y; j < y + bh; j++) for (let k = x; k < x + bw; k++) {
    if (!inB(w, k, j)) return 'off the edge of the map';
    const i = j * w.w + k;
    if (!w.ground[i]) return 'that is water';
    if (w.ground[i] === 3) return 'that is bare rock';
    if (w.bgrid[i] !== -1) return 'something is already built there';
    // a road can be laid over a path, but nothing over a road
    if (B.belt) { if (w.belt[i]) return 'there is a conveyor already'; continue; }
    if (B.paves) { if (w.road[i] && !(B.road && w.road[i] < paveLevel(B))) return `there is a ${w.road[i] >= 2 ? 'road' : 'path'} already`; continue; }
    if (w.belt[i]) return 'a conveyor runs there';
    if (w.front[i]) return "it would block another building's door";
  }
  if (!B.paves) {
    const at = { x, y, w: bw, h: bh, rot }, f = front(at), fi = f.y * w.w + f.x;
    if (B.shore) {
      // boats launch from the door onto water; people reach the door from open land beside it
      if (!inB(w, f.x, f.y) || w.ground[fi] !== 0) return 'a dock has to open onto water';
      const s = beside(at), si = s.y * w.w + s.x;
      if (!inB(w, s.x, s.y) || !w.ground[si] || w.bgrid[si] !== -1 || w.front[si]) return 'a dock needs open land beside its door';
    }
    else if (!inB(w, f.x, f.y) || !w.ground[fi] || w.bgrid[fi] !== -1) return 'its door would open onto nothing';
  }
  return null;
}

export const canPlace = (S: State, type: string, x: number, y: number, rot = 0) => placeProblem(S, type, x, y, rot) === null;

/**
 * Anyone standing where a new building goes steps out to its door front, and anyone whose
 * route crosses it finds a new one.
 */
function stepOut(S: State, b: Building) {
  const d = door(b), inFoot = (x: number, y: number) => x >= b.x && y >= b.y && x < b.x + b.w && y < b.y + b.h;
  for (const a of S.agents) {
    const inside = inFoot(Math.floor(a.x), Math.floor(a.y));
    if (!inside && !a.path.some(([x, y]) => inFoot(x, y) && !(x === d.x && y === d.y))) continue;
    if (inside) { const f = front(b); a.x = f.x + 0.5; a.y = f.y + 0.5; }
    a.path = [];
    const t = a.task, to = a.state === 'toSrc' ? t?.src : a.state === 'toDst' ? t?.dst : a.state === 'toWork' ? a.work : a.state === 'visit' && a.visit ? S.bmap.get(S.towns[a.visit.back ? a.visit.from : a.visit.to].store) : null;
    // an explorer on the way out rows on for the shore they set out for (or, finding no way, turns for home)
    if (a.state === 'visit' && a.visit?.explore && !a.visit.back) moveTo(S, a, a.visit.explore[0], a.visit.explore[1]);
    else if (to && !to.dead) goToBuilding(S, a, to);
    else if (a.state === 'wander') a.state = 'idle';
  }
}

/** Mark or clear a building's door and the open tile in front of it (beside it, for a dock), and a dock's launching place. */
function setDoor(S: State, b: Building, on: boolean) {
  const w = S.world, d = door(b), i = d.y * w.w + d.x, o = bp(S, b).shore ? beside(b) : front(b), f = inB(w, o.x, o.y) ? o.y * w.w + o.x : -1;
  w.door[i] = on ? 1 : 0;
  if (bp(S, b).shore) { w.dock[i] = on ? b.town + 1 : 0; w.docks += on ? 1 : -1; }
  if (f >= 0 && f < w.front.length) w.front[f] = Math.max(0, w.front[f] + (on ? 1 : -1));
  // a new dock opens the water to rowers
  if (on && bp(S, b).shore) reshaped(w);
}

/** Place a building (or a road tile). New buildings start as construction sites unless `complete`. */
/**
 * Lift a building off the map for a moment, as if it were gone (its tiles, door and place in the lists), and return
 * a function that puts it back exactly: for asking where something could go if this building came down.
 */
export function lift(S: State, b: Building): () => void {
  const w = S.world, at = S.buildings.indexOf(b);
  for (let j = b.y; j < b.y + b.h; j++) for (let k = b.x; k < b.x + b.w; k++) w.bgrid[j * w.w + k] = -1;
  reshaped(w);
  setDoor(S, b, false);
  S.buildings.splice(at, 1); S.bmap.delete(b.id);
  return () => {
    for (let j = b.y; j < b.y + b.h; j++) for (let k = b.x; k < b.x + b.w; k++) w.bgrid[j * w.w + k] = b.id;
    setDoor(S, b, true);
    S.buildings.splice(at, 0, b); S.bmap.set(b.id, b);
  };
}

/**
 * Turn a building a quarter about its centre (`by` 1 from south to west, 3 to turn back), if its turned footprint and
 * door fit there; returns whether it turned. Anyone inside steps out of its new door; routes through it are found again.
 */
export function turnBuilding(S: State, b: Building, by = 1): boolean {
  const B = bp(S, b), w = S.world;
  if (B.bridge || B.paves || b.dead) return false;
  // a farm that has grown fields (or is laying them) no longer turns
  if (b.size > 0 || B.field || S.buildings.some(o => o.of === b.id)) return false;
  // about its centre, rounding toward its corner so that turning back undoes it exactly
  const rot = (b.rot + by) % 4, d = dims(B, rot), x = b.x + Math.trunc((b.w - d.w) / 2), y = b.y + Math.trunc((b.h - d.h) / 2);
  const back = lift(S, b), ok = canPlace(S, b.type, x, y, rot);
  back();
  if (!ok) return false;
  for (let j = b.y; j < b.y + b.h; j++) for (let k = b.x; k < b.x + b.w; k++) w.bgrid[j * w.w + k] = -1;
  reshaped(w);
  setDoor(S, b, false);
  b.x = x; b.y = y; b.w = d.w; b.h = d.h; b.rot = rot;
  turned(S);
  for (let j = y; j < y + d.h; j++) for (let k = x; k < x + d.w; k++) { const i = j * w.w + k; w.bgrid[i] = b.id; w.tree[i] = 0; unpave(w, i); }
  setDoor(S, b, true);
  stepOut(S, b);
  return true;
}

export function placeBuilding(S: State, type: string, x: number, y: number, complete: boolean, rot = 0, size?: { w: number; h: number }): Building | null {
  const B = S.content.blueprints[type], w = S.world;
  if (B.belt) { const i = y * w.w + x; setBelt(w, i, true); w.tree[i] = 0; return null; }
  if (B.paves) { const i = y * w.w + x; pave(w, i, paveLevel(B)); w.tree[i] = 0; return null; }
  // (new fields take the size of the strip they are laid on)
  const { w: bw, h: bh } = size ?? dims(B, rot);
  const b: Building = {
    id: S.nextId++, type, x, y, w: bw, h: bh, rot, site: !complete, build: 0, inv: {}, incoming: {}, reserved: {},
    worker: null, hands: [], timer: 0, plantT: 0, paused: false, status: { t: '', l: 'ok' }, residents: [], eat: 0, hunger: 0, bots: [], dead: false, priority: 0, reason: '', town: nearestTown(S, x + bw / 2, y + bh / 2), used: 0, waiting: {}, noWay: null, doorAt: null, extra: 0, wear: 0, fire: 0, stall: 0, burn: 0, flood: 0, sick: 0, size: 0, of: null, made: 0, ate: {},
  };
  for (let j = y; j < y + bh; j++) for (let k = x; k < x + bw; k++) { const i = j * w.w + k; w.bgrid[i] = b.id; w.tree[i] = 0; unpave(w, i); }
  setDoor(S, b, true);
  S.buildings.push(b); S.bmap.set(b.id, b);
  stepOut(S, b);
  if (complete) completeSite(S, b, false);
  return b;
}

/**
 * A bridge over the water tiles x..x+w-1, y..y+h-1 (one row or one column), its door on the near bank
 * `from` and the far bank `to`. Both banks are kept open like door fronts. Starts as a construction site.
 */
export function placeBridge(S: State, x: number, y: number, w: number, h: number, from: { x: number; y: number }, to: { x: number; y: number }, town: number): Building {
  const W = S.world;
  const b: Building = {
    id: S.nextId++, type: 'bridge', x, y, w, h, site: true, build: 0, inv: {}, incoming: {}, reserved: {},
    worker: null, hands: [], timer: 0, plantT: 0, paused: false, status: { t: '', l: 'ok' }, residents: [], eat: 0, hunger: 0, bots: [], dead: false, priority: 0, reason: '', town, used: 0, waiting: {}, noWay: null, doorAt: { ...from }, rot: 0, extra: 0, wear: 0, fire: 0, stall: 0, burn: 0, flood: 0, sick: 0, size: 0, of: null, made: 0, ate: {},
  };
  for (let j = y; j < y + h; j++) for (let k = x; k < x + w; k++) W.bgrid[j * W.w + k] = b.id;
  for (const p of [from, to]) W.front[p.y * W.w + p.x]++;
  S.buildings.push(b); S.bmap.set(b.id, b);
  return b;
}

/** The far bank of a bridge: one step beyond the end of its span opposite its door. */
function farBank(b: Building) {
  const d = door(b);
  if (b.h === 1) return d.x < b.x ? { x: b.x + b.w, y: b.y } : { x: b.x - 1, y: b.y };
  return d.y < b.y ? { x: b.x, y: b.y + b.h } : { x: b.x, y: b.y - 1 };
}

export function completeSite(S: State, b: Building, announce: boolean) {
  b.site = false; b.build = 0; b.inv = {}; b.incoming = {}; b.reserved = {}; b.waiting = {};
  const B = bp(S, b);
  // new fields join their farm and are gone
  if (B.field) {
    setDoor(S, b, false);
    b.dead = true; S.buildings = S.buildings.filter(o => o !== b); S.bmap.delete(b.id);
    joinFields(S, b, b.of !== null ? S.bmap.get(b.of) : undefined, announce);
    return;
  }
  if (B.bridge) {
    for (let j = b.y; j < b.y + b.h; j++) for (let k = b.x; k < b.x + b.w; k++) S.world.bridge[j * S.world.w + k] = 1;
    reshaped(S.world);
    // the long ways round it remembered were measured before this bridge stood
    if (S.towns[b.town]) S.towns[b.town].detours = [];
  }
  // a dock launches its own settlement's boats (whose it is is settled once it stands), and with ships on comes with one
  if (B.shore) { const d = door(b), i = d.y * S.world.w + d.x; if (S.world.dock[i]) { S.world.dock[i] = b.town + 1; reshaped(S.world); } }
  if (B.shore && S.ships) for (let k = 0; k < S.content.tuning.sea.dockBoats; k++) launch(S, b);
  if (B.couriers) {
    const d = door(b);
    for (let k = 0; k < B.couriers.count; k++) {
      const a = makeAgent(S, 'bot', d.x + 0.5 + (k - 1) * 0.3, d.y + 0.5);
      a.depot = b; b.bots.push(a.id);
    }
    if (announce) emit(S, 'good', `${B.name} finished: ${B.couriers.count} bots are hauling`, true);
  } else if (announce) emit(S, 'good', `${B.name} finished`, true);
}

export function demolish(S: State, b: Building) {
  // new fields being laid for it go with it
  for (const o of S.buildings.filter(o => o.of === b.id)) demolish(S, o);
  b.dead = true;
  S.buildings = S.buildings.filter(o => o !== b); S.bmap.delete(b.id);
  const w = S.world;
  for (let j = b.y; j < b.y + b.h; j++) for (let k = b.x; k < b.x + b.w; k++) { w.bgrid[j * w.w + k] = -1; w.bridge[j * w.w + k] = 0; }
  reshaped(w);
  if (bp(S, b).bridge) for (const p of [door(b), farBank(b)]) w.front[p.y * w.w + p.x] = Math.max(0, w.front[p.y * w.w + p.x] - 1);
  else setDoor(S, b, false);
  for (const a of S.agents) if (a.work === b) { a.work = null; a.role = 'carrier'; a.state = 'idle'; a.path = []; }
  b.worker = null; b.hands = [];
  const gone = b.residents.length;
  for (const id of [...b.residents]) { const a = S.amap.get(id); if (a) { removeAgent(S, a); S.stats.departures++; S.stats.demolitionDepartures++; } }
  for (const id of b.bots) { const a = S.amap.get(id); if (a) removeAgent(S, a); }
  if (gone) emit(S, 'bad', `${gone} villager${gone > 1 ? 's' : ''} left: their home was demolished`);
}

/**
 * Saplings to grow, kept beside the world so a tick does not scan every tile. Derived, never saved:
 * rebuilt from the tree grid when missing (a new or loaded world). Each sapling grows on its own, so
 * the order they are visited in never matters.
 */
const saplingSets = new WeakMap<World, Set<number>>();
export function saplings(w: World): Set<number> {
  let s = saplingSets.get(w);
  if (!s) { s = new Set(); for (let i = 0; i < w.tree.length; i++) if (w.tree[i] === 1) s.add(i); saplingSets.set(w, s); }
  return s;
}
export function plant(w: World, i: number) { w.tree[i] = 1; w.grow[i] = 0; saplings(w).add(i); }

/**
 * The tiles feet have worn and that have not yet faded back, kept beside the world so fading them does not scan every
 * tile. Derived, never saved: rebuilt from the wear grid when missing. Each tile fades on its own.
 */
const wornSets = new WeakMap<World, Set<number>>();
export function worn(w: World): Set<number> {
  let s = wornSets.get(w);
  if (!s) { s = new Set(); for (let i = 0; i < w.wear.length; i++) if (w.wear[i] > 0) s.add(i); wornSets.set(w, s); }
  return s;
}
/** A footstep on a tile. */
export function tread(w: World, i: number) { w.wear[i] += 1; worn(w).add(i); }

/** What a paving blueprint lays: 1 a path, 2 a road, 3 a road of stone. */
export const paveLevel = (B: BlueprintDef) => (B.stone ? 3 : B.road ? 2 : 1);

/** Pave a tile at a level (1 path, 2 road, 3 stone road), keeping the world's counts of road and stone tiles. */
export function pave(w: World, i: number, level: number) {
  unpave(w, i);
  w.road[i] = level;
  if (level >= 2) w.roads++;
  if (level === 3) w.stone++;
}

/** Take up whatever paves a tile. */
export function unpave(w: World, i: number) {
  if (w.road[i] >= 2) w.roads--;
  if (w.road[i] === 3) w.stone--;
  w.road[i] = 0;
}
