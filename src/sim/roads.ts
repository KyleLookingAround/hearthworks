/**
 * Roads (Phase 21): a village or town that knows the road lays one now and then as a long straight strip
 * where its people walk most, cutting through what stands in the line (moving people first, salvaging as
 * replanning does). See design/systems/roads.md. No randomness: ties break by scan order.
 */
import { cancelTask } from './logistics.ts';
import { add, bp, chronicle, ctr, demolish, door, emit, villagers } from './world.ts';
import type { Building, State, Town } from './types.ts';

const R = (S: State) => S.content.tuning.roads;
/** The blueprint that paves roads (rather than paths). */
const roadDef = (S: State) => Object.values(S.content.blueprints).find(B => B.paves && B.road);

/** The strain of distance on a village's or town's deliveries, 0 to 1: the need `traffic`. */
export function traffic(S: State, town: Town): number {
  if (!S.plannedRoads || town.form === 'hamlet') return 0;
  return Math.max(0, Math.min(1, (town.reach - R(S).trafficFrom) / R(S).trafficSpan));
}

interface Run { x0: number; y0: number; x1: number; y1: number; tiles: number[]; cut: Building[]; homes: Building[]; worn: number; s: number }

/** What a road may not cut through: storage, bridges, docks and anything else on the shore, places that pave. */
const solid = (S: State, b: Building) => { const B = bp(S, b); return B.storage || !!B.bridge || B.shore; };

/** The settlement's extent: its buildings' bounding box, `margin` tiles around, inside the map. */
function extent(S: State, town: Town) {
  const W = S.world, m = R(S).margin;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const b of S.buildings) if (b.town === town.id && !bp(S, b).bridge) { x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.w - 1); y1 = Math.max(y1, b.y + b.h - 1); }
  return { x0: Math.max(0, x0 - m), y0: Math.max(0, y0 - m), x1: Math.min(W.w - 1, x1 + m), y1: Math.min(W.h - 1, y1 + m) };
}

/** Straight runs along one row (or column): split where water, rock or a building it cannot cut lies. */
function runsAlong(S: State, town: Town, horizontal: boolean, line: number, from: number, to: number): Run[] {
  const W = S.world, out: Run[] = [];
  let cur: Run | null = null;
  const close = () => { if (cur) out.push(cur); cur = null; };
  for (let k = from; k <= to; k++) {
    const x = horizontal ? k : line, y = horizontal ? line : k, i = y * W.w + x;
    const id = W.bgrid[i], b = id >= 0 ? S.bmap.get(id) : undefined;
    // its own settlement's buildings may be cut; anyone else's, and what may never be cut, stop it
    if (W.ground[i] !== 1 && W.ground[i] !== 2 || (b && (solid(S, b) || b.town !== town.id))) { close(); continue; }
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
function have(S: State, town: Town, g: string) {
  let n = 0;
  for (const b of S.buildings) if (b.town === town.id && !b.site && bp(S, b).storage) n += (b.inv[g] || 0) - (b.reserved[g] || 0);
  return n;
}
function take(S: State, town: Town, g: string, n: number) {
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
  const E = extent(S, town), d = door(main), front = { x: d.x, y: d.y + 1 };
  const first = !town.roads.length;
  let best: Run | null = null;
  for (const horizontal of [true, false]) {
    const [l0, l1, f0, f1] = horizontal ? [E.y0, E.y1, E.x0, E.x1] : [E.x0, E.x1, E.y0, E.y1];
    for (let line = l0; line <= l1; line++) {
      W.work.plannerSpots++;
      // the first road passes by the first yard's door; later ones keep apart from the settlement's roads the same way
      if (first && Math.abs(line - (horizontal ? front.y : front.x)) > 2) continue;
      if (!first && town.roads.some(r => (r[1] === r[3]) === horizontal && Math.abs((horizontal ? r[1] : r[0]) - line) < P.spacing)) continue;
      for (const run of runsAlong(S, town, horizontal, line, f0, f1)) {
        if (run.tiles.length < P.minLength || run.worn / run.tiles.length < P.minTraffic) continue;
        if (first && !run.tiles.some(i => Math.abs((i % W.w) - front.x) <= 2 && Math.abs(Math.floor(i / W.w) - front.y) <= 2)) continue;
        const fresh = run.tiles.filter(i => W.road[i] !== 2).length;
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
    for (const a of S.agents) if (a.task && (a.task.src === b || a.task.dst === b)) cancelTask(a);
    if (town.planner.site === b.id) town.planner.site = null;
    demolish(S, b);
    for (const [k, n] of back) if (n > 0) add(store.inv, k, n);
  }
  let laid = 0;
  for (const i of run.tiles) { if (W.road[i] !== 2) { W.road[i] = 2; W.roads++; laid++; } W.tree[i] = 0; }
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
  if (town.form === 'hamlet') return false;
  town.roadT += dt;
  if (town.roadT < R(S).lookEverySeconds) return false;
  town.roadT = 0;
  // main roads only: one, and another for every `villagers_per_road` people
  const pop = villagers(S).filter(a => a.home?.town === town.id).length;
  if (town.roads.length >= 1 + Math.floor(pop / R(S).villagersPerRoad)) return false;
  const run = bestRoad(S, town);
  if (!run) return false;
  const fresh = run.tiles.filter(i => S.world.road[i] !== 2).length;
  for (const g in B.cost) if (have(S, town, g) < B.cost[g] * fresh) { town.planner.status = `Saving ${S.content.goods[g]?.name.toLowerCase() ?? g} for a road`; return false; }
  for (const g in B.cost) take(S, town, g, B.cost[g] * fresh);
  layRoad(S, town, run);
  town.planner.status = `Laid a road: ${run.tiles.length} tiles, straight through`;
  town.knows[B.id].used = S.t;
  return true;
}

/** Is there a road tile within `r` of the first storage yard's door front? */
export function roadByCentre(S: State, town: Town, r = 2): boolean {
  const W = S.world, main = S.bmap.get(town.store);
  if (!main) return false;
  const d = door(main);
  for (let y = d.y + 1 - r; y <= d.y + 1 + r; y++) for (let x = d.x - r; x <= d.x + r; x++) if (x >= 0 && y >= 0 && x < W.w && y < W.h && W.road[y * W.w + x] === 2) return true;
  return false;
}

