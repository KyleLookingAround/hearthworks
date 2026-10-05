/**
 * Roads (Phase 21): a village or town that knows the road lays one now and then as a long straight strip
 * where its people walk most, cutting through what stands in the line (moving people first, salvaging as
 * replanning does). See design/systems/roads.md. No randomness: ties break by scan order.
 */
import { cancelTask, touches } from './logistics.ts';
import { add, bp, chronicle, ctr, demolish, emit, front as frontOf, pave, seasonOf, storesOnTrack, villagers } from './world.ts';
import { enough, foodChainOf } from './production.ts';
import type { Building, State, Town } from './types.ts';

const R = (S: State) => S.content.tuning.roads;
/** The blueprint that paves roads (rather than paths). */
const roadDef = (S: State) => Object.values(S.content.blueprints).find(B => B.paves && B.road && !B.stone);
/** The blueprint that paves roads in stone. */
const stoneDef = (S: State) => Object.values(S.content.blueprints).find(B => B.paves && B.road && B.stone);

/** The strain of distance on a village's or town's deliveries, 0 to 1: the need `traffic`. */
export function traffic(S: State, town: Town): number {
  if (!S.plannedRoads || town.form === 'hamlet') return 0;
  return Math.max(0, Math.min(1, (town.reach - R(S).trafficFrom) / R(S).trafficSpan));
}

interface Run { x0: number; y0: number; x1: number; y1: number; tiles: number[]; cut: Building[]; homes: Building[]; worn: number; s: number }

/**
 * What a road may not cut through: storage, bridges, docks and anything else on the shore; and, while the settlement
 * can least spare its bread (with seasons, from autumn to the end of winter or while its winter store is behind), the
 * workplaces of its food chain: a village of 48 lost its bakery and two farms to a road in late winter.
 */
const solid = (S: State, b: Building, lean: boolean) => {
  const B = bp(S, b);
  return B.storage || !!B.bridge || B.shore || (lean && Object.keys(B.output).some(g => foodChainOf(S).has(g)));
};

/** With seasons, can the settlement least spare its bread now? Autumn or winter, or its winter store behind. */
function lean(S: State, town: Town): boolean {
  const s = seasonOf(S);
  return S.seasons && (s === 'autumn' || s === 'winter' || !storesOnTrack(S, town));
}

/** The settlement's extent: its buildings' bounding box, `margin` tiles around, inside the map. */
function extent(S: State, town: Town) {
  const W = S.world, m = R(S).margin;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const b of S.buildings) if (b.town === town.id && !bp(S, b).bridge) { x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.w - 1); y1 = Math.max(y1, b.y + b.h - 1); }
  return { x0: Math.max(0, x0 - m), y0: Math.max(0, y0 - m), x1: Math.min(W.w - 1, x1 + m), y1: Math.min(W.h - 1, y1 + m) };
}

/** Straight runs along one row (or column): split where water, rock or a building it cannot cut lies. */
function runsAlong(S: State, town: Town, horizontal: boolean, line: number, from: number, to: number, spare: boolean): Run[] {
  const W = S.world, out: Run[] = [];
  let cur: Run | null = null;
  const close = () => { if (cur) out.push(cur); cur = null; };
  for (let k = from; k <= to; k++) {
    const x = horizontal ? k : line, y = horizontal ? line : k, i = y * W.w + x;
    const id = W.bgrid[i], b = id >= 0 ? S.bmap.get(id) : undefined;
    // its own settlement's buildings may be cut; anyone else's, and what may never be cut, stop it
    if (W.ground[i] !== 1 && W.ground[i] !== 2 || (b && (solid(S, b, !spare) || b.town !== town.id))) { close(); continue; }
    cur ??= { x0: x, y0: y, x1: x, y1: y, tiles: [], cut: [], homes: [], worn: 0, s: 0 };
    cur.x1 = x; cur.y1 = y; cur.tiles.push(i); cur.worn += W.wear[i];
    if (b && !cur.cut.includes(b)) { cur.cut.push(b); if (bp(S, b).homes && !b.site) cur.homes.push(b); }
  }
  close();
  return out;
}

/** Free beds in the settlement's homes outside `except`. */
function spareBeds(S: State, town: Town, except: Set<Building>) {
  let n = 0;
  for (const b of S.buildings) if (b.town === town.id && !b.site && !except.has(b) && bp(S, b).homes) n += bp(S, b).homes - b.residents.length;
  return n;
}

/** Goods in its stores, and taking them. */
export function have(S: State, town: Town, g: string) {
  let n = 0;
  for (const b of S.buildings) if (b.town === town.id && !b.site && bp(S, b).storage) n += (b.inv[g] || 0) - (b.reserved[g] || 0);
  return n;
}
export function take(S: State, town: Town, g: string, n: number) {
  for (const b of S.buildings) {
    if (n <= 0) break;
    if (b.town !== town.id || b.site || !bp(S, b).storage) continue;
    const k = Math.min(n, (b.inv[g] || 0) - (b.reserved[g] || 0));
    if (k > 0) { add(b.inv, g, -k); n -= k; }
  }
}

/**
 * The best straight run for a new road, or null: worn at least `min_traffic` footsteps a tile, at least `min_length` long, the first
 * one by the first storage yard's door, later ones `spacing` from its roads the same way, everyone in its homes
 * with a bed to move to.
 */
export function bestRoad(S: State, town: Town): Run | null {
  const P = R(S), W = S.world, main = S.bmap.get(town.store);
  if (!main) return null;
  const E = extent(S, town), front = frontOf(main), spare = !lean(S, town);
  const first = !town.roads.length;
  let best: Run | null = null;
  for (const horizontal of [true, false]) {
    const [l0, l1, f0, f1] = horizontal ? [E.y0, E.y1, E.x0, E.x1] : [E.x0, E.x1, E.y0, E.y1];
    for (let line = l0; line <= l1; line++) {
      W.work.plannerSpots++;
      // the first road passes by the first yard's door; later ones keep apart from the settlement's roads the same way
      if (first && Math.abs(line - (horizontal ? front.y : front.x)) > 2) continue;
      if (!first && town.roads.some(r => (r[1] === r[3]) === horizontal && Math.abs((horizontal ? r[1] : r[0]) - line) < P.spacing)) continue;
      for (const run of runsAlong(S, town, horizontal, line, f0, f1, spare)) {
        if (run.tiles.length < P.minLength || run.worn / run.tiles.length < P.minTraffic) continue;
        if (first && !run.tiles.some(i => Math.abs((i % W.w) - front.x) <= 2 && Math.abs(Math.floor(i / W.w) - front.y) <= 2)) continue;
        const fresh = run.tiles.filter(i => W.road[i] < 2).length;
        if (fresh < P.minLength) continue;
        const movers = run.homes.reduce((n, h) => n + h.residents.length, 0);
        if (movers && spareBeds(S, town, new Set(run.homes)) < movers) continue;
        run.s = run.worn - P.demolishWeight * (run.cut.length - run.homes.length) - P.homeWeight * run.homes.length;
        if (run.s <= 0) continue;
        if (!best || run.s > best.s) best = run;
      }
    }
  }
  return best;
}

/** Lay a road along a run: people move out of the homes in its line, what stands there comes down (salvaged), and the strip is paved. */
export function layRoad(S: State, town: Town, run: Run) {
  const W = S.world, store = S.bmap.get(town.store)!, share = S.content.tuning.planner.salvageShare;
  const gone = new Set(run.cut);
  // everyone moves first, to the nearest free bed elsewhere
  for (const h of run.homes) for (const id of [...h.residents]) {
    const a = S.amap.get(id);
    if (!a) continue;
    const to = S.buildings.filter(b => b.town === town.id && !b.site && !gone.has(b) && bp(S, b).homes && bp(S, b).homes > b.residents.length)
      .sort((p, q) => Math.hypot(ctr(p).x - a.x, ctr(p).y - a.y) - Math.hypot(ctr(q).x - a.x, ctr(q).y - a.y))[0];
    if (!to) continue;
    h.residents = h.residents.filter(r => r !== id);
    a.home = to; to.residents.push(id);
    S.stats.roadMoved++;
  }
  for (const b of run.cut) {
    const B = bp(S, b);
    // a site gives back what was delivered; a building a share of its cost
    const back: [string, number][] = b.site ? Object.entries(b.inv) : Object.entries(B.cost).map(([k, n]) => [k, Math.floor(n * share)]);
    for (const a of S.agents) if (touches(a, b)) cancelTask(a);
    if (town.planner.site === b.id) town.planner.site = null;
    demolish(S, b);
    for (const [k, n] of back) if (n > 0) add(store.inv, k, n);
  }
  let laid = 0;
  for (const i of run.tiles) { if (W.road[i] < 2) { pave(W, i, 2); laid++; } W.tree[i] = 0; }
  town.roads.push([run.x0, run.y0, run.x1, run.y1, S.t]);
  S.stats.roadsLaid++; S.stats.roadTiles += laid; S.stats.roadCut += run.cut.length;
  const moved = run.homes.reduce((n, h) => n + h.residents.length, 0);
  const why = `${town.name} laid a road ${run.tiles.length} tiles long${town.roads.length === 1 ? ' through its centre' : ''}` + (run.cut.length ? `, clearing ${run.cut.length} building${run.cut.length > 1 ? 's' : ''}` : '');
  chronicle(S, town.id, 'road', why);
  emit(S, 'info', why, true);
  return moved;
}

/**
 * Called at each of the planner's looks: every `look_every_seconds`, a self-planning village or town that knows
 * the road lays the best run it can pay for. Returns true when it laid one.
 */
export function planRoads(S: State, town: Town, dt: number): boolean {
  const B = roadDef(S);
  if (!S.plannedRoads || !B || !(B.id in town.knows)) return false;
  // roads in use keep the knowledge of them alive, as a building does
  if (town.roads.length) town.knows[B.id].used = S.t;
  // and its roads of stone keep the stone road in mind
  const SB = stoneDef(S);
  if (SB && SB.id in town.knows && town.roads.some(r => paved(S, r))) town.knows[SB.id].used = S.t;
  if (town.form === 'hamlet') return false;
  town.roadT += dt;
  if (town.roadT < R(S).lookEverySeconds) return false;
  town.roadT = 0;
  // main roads only: one, and another for every `villagers_per_road` people; with none to lay, it repaves one in stone
  const pop = villagers(S).filter(a => a.home?.town === town.id).length;
  if (town.roads.length >= 1 + Math.floor(pop / R(S).villagersPerRoad)) return paveInStone(S, town);
  const run = bestRoad(S, town);
  if (!run) return paveInStone(S, town);
  const fresh = run.tiles.filter(i => S.world.road[i] < 2).length;
  for (const g in B.cost) if (have(S, town, g) < B.cost[g] * fresh) { town.planner.status = `Saving ${S.content.goods[g]?.name.toLowerCase() ?? g} for a road`; return false; }
  for (const g in B.cost) take(S, town, g, B.cost[g] * fresh);
  layRoad(S, town, run);
  town.planner.status = `Laid a road: ${run.tiles.length} tiles, straight through`;
  town.knows[B.id].used = S.t;
  return true;
}

/** Is any tile of one of a settlement's roads (a straight strip from end to end) paved in stone? */
function paved(S: State, r: number[]): boolean {
  const W = S.world, [x0, y0, x1, y1] = r;
  for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) if (W.road[y * W.w + x] === 3) return true;
  return false;
}

/** The tiles of one of a settlement's roads (a straight strip from end to end) still a road and not yet of stone. */
function unpaved(S: State, r: number[]): number[] {
  const W = S.world, out: number[] = [];
  const [x0, y0, x1, y1] = r;
  for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) { const i = y * W.w + x; if (W.road[i] === 2) out.push(i); }
  return out;
}

/**
 * Roads of stone: a settlement that knows the stone road repaves, with stone it can spare (its stores hold enough of
 * it, and all the strip needs), the busiest of its roads not yet of stone, the whole strip at once.
 */
function paveInStone(S: State, town: Town): boolean {
  const B = stoneDef(S);
  if (!B || !(B.id in town.knows)) return false;
  const W = S.world;
  let best: number[] | null = null, bw = 0;
  for (const r of town.roads) {
    const tiles = unpaved(S, r);
    if (!tiles.length || !Object.keys(B.cost).every(g => enough(S, town, g) && have(S, town, g) >= B.cost[g] * tiles.length)) continue;
    const worn = tiles.reduce((n, i) => n + W.wear[i], 0) / tiles.length;
    if (!best || worn > bw) { best = tiles; bw = worn; }
  }
  if (!best) return false;
  for (const g in B.cost) take(S, town, g, B.cost[g] * best.length);
  for (const i of best) pave(W, i, 3);
  town.knows[B.id].used = S.t;
  const why = `${town.name} paved a road in stone, ${best.length} tiles`;
  chronicle(S, town.id, 'road', why);
  emit(S, 'info', why, true);
  town.planner.status = `Paved a road in stone: ${best.length} tiles`;
  return true;
}

/** Is there a road tile within `r` of the first storage yard's door front? */
export function roadByCentre(S: State, town: Town, r = 2): boolean {
  const W = S.world, main = S.bmap.get(town.store);
  if (!main) return false;
  const f = frontOf(main);
  for (let y = f.y - r; y <= f.y + r; y++) for (let x = f.x - r; x <= f.x + r; x++) if (x >= 0 && y >= 0 && x < W.w && y < W.h && W.road[y * W.w + x] >= 2) return true;
  return false;
}

