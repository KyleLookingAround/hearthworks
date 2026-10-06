/**
 * Conveyors (Phase 19, second pass): belts laid in straight strips, on which goods ride with no hands between
 * the buildings whose doors open beside them. See design/systems/conveyors.md. No randomness: ties break by
 * building order and tile index.
 */
import { available, hubOf, hubWant, requestsNow, roomFor, staleBoard } from './logistics.ts';
import { add, bp, chronicle, distBB, emit, front, villagers } from './core.ts';
import { have, take } from './roads.ts';
import { beltsChanged, caches, type Besides } from './caches.ts';
export { turned } from './caches.ts';
import type { BlueprintDef, Building, ItemId, State, Town, World } from './types.ts';

const C = (S: State) => S.content.tuning.conveyors;
/** The blueprint that lays belts. */
export const beltDef = (S: State): BlueprintDef | undefined => Object.values(S.content.blueprints).find(B => B.belt);

/** Lay or take up a tile of belt, keeping the world's count. */
export function setBelt(w: World, i: number, on: boolean) {
  if (!!w.belt[i] === on) return;
  w.belt[i] = on ? 1 : 0;
  w.belts += on ? 1 : -1;
  beltsChanged(w);
}

/**
 * The belt network: each belt tile's line (tiles joined side by side), and the walk along a line from a tile,
 * worked out again only when a belt is laid or taken up (`beltsChanged`). Derived, never saved.
 */
export interface Net { line: Map<number, number>; from: Map<number, Map<number, number>> }
function net(w: World): Net {
  const C = caches(w);
  let n = C.net;
  if (n) return n;
  n = { line: new Map(), from: new Map() };
  let id = 0;
  for (let i = 0; i < w.belt.length; i++) {
    if (!w.belt[i] || n.line.has(i)) continue;
    const q = [i];
    n.line.set(i, id);
    for (let k = 0; k < q.length; k++) for (const j of steps(w, q[k])) if (!n.line.has(j)) { n.line.set(j, id); q.push(j); }
    id++;
  }
  C.net = n;
  return n;
}

/** The belt tiles beside a belt tile. */
function steps(w: World, i: number): number[] {
  const x = i % w.w, y = (i - x) / w.w, out: number[] = [];
  if (x > 0 && w.belt[i - 1]) out.push(i - 1);
  if (x < w.w - 1 && w.belt[i + 1]) out.push(i + 1);
  if (y > 0 && w.belt[i - w.w]) out.push(i - w.w);
  if (y < w.h - 1 && w.belt[i + w.w]) out.push(i + w.w);
  return out;
}

/** Tiles along the belt from one belt tile to every other on its line, and how each was reached. */
function walk(w: World, from: number): Map<number, number> {
  const N = net(w);
  let d = N.from.get(from);
  if (d) return d;
  d = new Map([[from, 0]]);
  const q = [from];
  for (let k = 0; k < q.length; k++) for (const j of steps(w, q[k])) if (!d.has(j)) { d.set(j, d.get(q[k])! + 1); q.push(j); }
  N.from.set(from, d);
  return d;
}

/** The tiles a load rides from one belt tile to another, in order (for drawing it). */
export function beltRoute(w: World, from: number, to: number): number[] {
  const d = walk(w, from), out = [to];
  if (!d.has(to)) return [from];
  for (let i = to; i !== from;) {
    const k = d.get(i)!;
    i = steps(w, i).find(j => d.get(j) === k - 1)!;
    out.push(i);
  }
  return out.reverse();
}

/** The belt tile a building is beside: the nearest within `reach` of its door front (ties by tile index), or -1. */
export function beltBy(S: State, b: Building): number {
  const w = S.world, r = C(S).reach, f = front(b);
  let best = -1, bd = Infinity;
  for (let y = f.y - r; y <= f.y + r; y++) for (let x = f.x - r; x <= f.x + r; x++) {
    if (x < 0 || y < 0 || x >= w.w || y >= w.h || !w.belt[y * w.w + x]) continue;
    const d = Math.abs(x - f.x) + Math.abs(y - f.y);
    if (d < bd) { bd = d; best = y * w.w + x; }
  }
  return best;
}

/**
 * Every standing building beside a belt, with the tile it uses and that tile's line: worked out again only when a
 * building is placed, comes down or turns (`turned`), or a belt is laid. Derived, never saved.
 */
function beside(S: State): Map<Building, { tile: number; line: number }> {
  const C = caches(S.world), N = net(S.world), key = `${S.nextId}:${S.buildings.length}`, had = C.besides;
  if (had && had.net === N && had.key === key) return had.by;
  const out = new Map<Building, { tile: number; line: number }>(), lines: Besides['lines'] = new Map();
  C.besides = { net: N, key, by: out, lines };
  for (const b of S.buildings) {
    if (b.dead || bp(S, b).bridge) continue;
    const t = beltBy(S, b);
    if (t < 0) continue;
    const o = { tile: t, line: N.line.get(t)! };
    out.set(b, o);
    let l = lines.get(o.line);
    if (!l) lines.set(o.line, l = []);
    l.push([b, o]);
  }
  return out;
}
/** The buildings beside each belt line, in building order (as `beside` lists them). */
const besideLine = (S: State, line: number) => caches(S.world).besides!.lines.get(line)!;

/**
 * Each tick, before the carriers look for work: loads that have ridden their way come off, then every request
 * from a building beside a belt is met from the nearest building beside the same line that offers the good, and
 * surplus goes to the nearest store beside it.
 */
export function runBelts(S: State) {
  if (S.parcels.length) {
    const riding = [];
    for (const p of S.parcels) {
      if (S.t < p.at + p.secs - 1e-9) { riding.push(p); continue; }
      const dst = S.bmap.get(p.dst);
      if (!dst || dst.dead) continue;
      add(dst.inv, p.item, p.n); add(dst.incoming, p.item, -p.n);
      S.stats.beltLoads++; S.stats.beltGoods += p.n; S.stats.beltSeconds += p.secs;
      const ways = S.towns[dst.town]?.ways;
      add(S.stats.ways, 'belt', p.n);
      if (ways) add(ways, 'belt', p.n);
      if (p.hub) { S.stats.handedOnBelt += p.n; if (ways) add(ways, 'handed', p.n); }
    }
    if (riding.length !== S.parcels.length) { S.parcels = riding; staleBoard(S); }
  }
  if (!S.world.belts) return;
  const by = beside(S);
  if (by.size < 2) return;
  const P = C(S), L = S.content.tuning.logistics, w = S.world;
  // a building sends one load every `gap_seconds` from each belt tile
  const busy = new Set<number>();
  for (const p of S.parcels) if (S.t - p.at < P.gapSeconds - 1e-9) busy.add(p.from);
  const send = (src: Building, dst: Building, item: ItemId, n: number, d: number, hub = false) => {
    const a = by.get(src)!, b = by.get(dst)!;
    add(src.inv, item, -n); add(dst.incoming, item, n);
    S.parcels.push({ item, n, src: src.id, dst: dst.id, from: a.tile, to: b.tile, at: S.t, secs: (d + 2) / P.speed, ...(hub ? { hub } : {}) });
    busy.add(a.tile);
    staleBoard(S, src, dst);
  };
  // the buildings beside each line with some of a good to send, in building order (as `besideLine` lists them), sorted
  // out once a step as a line is first asked about: loads only go out from here on, so one with none to send now has
  // none for the rest of the step, and passing it over changes nothing
  const offers = new Map<number, Map<ItemId, [Building, { tile: number; line: number }][]>>();
  const offering = (line: number, item: ItemId) => {
    let m = offers.get(line);
    if (!m) {
      offers.set(line, m = new Map());
      for (const e of besideLine(S, line)) {
        const s = e[0], B = bp(S, s);
        for (const g of B.storage ? Object.keys(s.inv) : Object.keys(B.output)) {
          if (available(S, s, g) <= 0) continue;
          let l = m.get(g);
          if (!l) m.set(g, l = []);
          l.push(e);
        }
      }
    }
    return m.get(item) ?? [];
  };
  // the nearest building along the belt to `dst` that can send `item`: same line and settlement, its belt tile free
  const nearest = (dst: Building, item: ItemId, ok: (s: Building) => boolean) => {
    const at = by.get(dst)!, d = walk(w, at.tile);
    let best: Building | null = null, bd = Infinity;
    for (const [s, o] of offering(at.line, item)) {
      if (s === dst || o.line !== at.line || s.town !== dst.town || busy.has(o.tile) || !ok(s)) continue;
      const k = d.get(o.tile)!;
      if (k < bd) { bd = k; best = s; }
    }
    return best ? { s: best, d: bd } : null;
  };
  const reqs = requestsNow(S).filter(r => by.has(r.dst)).sort((p, q) => p.pri - q.pri || p.dst.id - q.dst.id);
  for (const r of reqs) {
    const got = nearest(r.dst, r.item, s => available(S, s, r.item) > 0);
    if (!got) continue;
    send(got.s, r.dst, r.item, Math.min(r.need, P.carry, available(S, got.s, r.item)), got.d);
  }
  // a building off the belt asking for a good from far away: the belt brings it to the yard of its district, if that yard
  // is beside the belt, for its carriers to take on on foot (see hubFor)
  const L0 = S.content.tuning.logistics, busyHub = new Set<Building>();
  for (const r of requestsNow(S)) {
    if (by.has(r.dst) || r.dst.site || bp(S, r.dst).storage) continue;
    const hub = hubOf(S, r.dst);
    if (!hub || !by.has(hub) || busyHub.has(hub)) continue;
    const want = hubWant(S, hub, r.item);
    if (want <= 0) continue;
    const got = nearest(hub, r.item, s => available(S, s, r.item) > 0 && distBB(s, r.dst) >= L0.relayMinTiles);
    if (!got) continue;
    send(got.s, hub, r.item, Math.min(want, P.carry, available(S, got.s, r.item)), got.d, true);
    busyHub.add(hub);
  }
  // surplus to the nearest store along the belt with room for it
  for (const [s, o] of by) {
    if (s.site || busy.has(o.tile)) continue;
    for (const item in bp(S, s).output) {
      const av = available(S, s, item);
      if (av < L.dumpAt) continue;
      const at = walk(w, o.tile);
      let st: Building | null = null, sd = Infinity;
      for (const [d, q] of besideLine(S, o.line)) {
        if (d === s || d.site || q.line !== o.line || d.town !== s.town || !bp(S, d).storage || roomFor(S, d, item) <= 0) continue;
        const k = at.get(q.tile)!;
        if (k < sd) { sd = k; st = d; }
      }
      if (st) { send(s, st, item, Math.min(av, P.carry, roomFor(S, st, item)), sd); break; }
    }
  }
}

/** A binary heap of [cost, tile], cheapest first, ties by tile index: the same order on every machine. */
function heap() {
  const a: [number, number][] = [];
  const less = (p: [number, number], q: [number, number]) => p[0] < q[0] || (p[0] === q[0] && p[1] < q[1]);
  return {
    size: () => a.length,
    push(c: number, i: number) {
      a.push([c, i]);
      for (let k = a.length - 1; k > 0;) { const u = (k - 1) >> 1; if (!less(a[k], a[u])) break; [a[k], a[u]] = [a[u], a[k]]; k = u; }
    },
    pop(): [number, number] {
      const top = a[0], last = a.pop()!;
      if (a.length) {
        a[0] = last;
        for (let k = 0; ;) {
          const l = 2 * k + 1, r = l + 1;
          let m = k;
          if (l < a.length && less(a[l], a[m])) m = l;
          if (r < a.length && less(a[r], a[m])) m = r;
          if (m === k) break;
          [a[k], a[m]] = [a[m], a[k]]; k = m;
        }
      }
      return top;
    },
  };
}

interface Strip { tiles: number[]; fresh: number; serves: number; s: number }

/**
 * The best belt to lay, or null: from a storage yard's door front along its lanes and doors' fronts (a lane tile
 * costing 1, a belt already laid a half, a door front off the lanes `rough_cost`) to the door front of a building no
 * belt serves yet, through no building, water or rock, at most `max_tiles` long. Scored by the buildings it would serve that no belt serves yet,
 * each by how far along it they lie from the yard: the walking it saves.
 */
export function bestBelt(S: State, town: Town): Strip | null {
  const P = C(S), w = S.world, r = P.reach;
  const served = new Set(beside(S).keys());
  // buildings by the tile in front of their door, for finding those a belt passes
  const doors = new Map<number, Building[]>();
  for (const b of S.buildings) {
    if (b.town !== town.id || b.dead || b.site || bp(S, b).bridge || bp(S, b).storage || served.has(b)) continue;
    const f = front(b);
    if (f.x < 0 || f.y < 0 || f.x >= w.w || f.y >= w.h) continue;
    const i = f.y * w.w + f.x;
    (doors.get(i) ?? doors.set(i, []).get(i)!).push(b);
  }
  if (!doors.size) return null;
  // a belt runs down the lanes (paths and roads) and across the doors' fronts: it never takes land a building could stand on
  const open = (i: number) => (w.ground[i] === 1 || w.ground[i] === 2) && w.bgrid[i] === -1 && (w.road[i] > 0 || w.front[i] > 0 || w.belt[i] > 0);
  const cost = (i: number) => (w.belt[i] ? 0.5 : w.road[i] ? 1 : P.roughCost);
  let best: Strip | null = null;
  for (const yard of S.buildings) {
    if (yard.town !== town.id || yard.site || yard.dead || !bp(S, yard).storage) continue;
    const f = front(yard);
    if (f.x < 0 || f.y < 0 || f.x >= w.w || f.y >= w.h) continue;
    const s0 = f.y * w.w + f.x;
    if (!open(s0)) continue;
    // cheapest routes from the yard's door front, out to `max_tiles` steps
    const dist = new Map<number, number>([[s0, 0]]), prev = new Map<number, number>(), hops = new Map<number, number>([[s0, 0]]);
    const q = heap();
    q.push(0, s0);
    while (q.size()) {
      const [d, i] = q.pop();
      if (d > dist.get(i)!) continue;
      const h = hops.get(i)!;
      if (h + 1 >= P.maxTiles) continue;
      const x = i % w.w, y = (i - x) / w.w;
      for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
        if (nx < 0 || ny < 0 || nx >= w.w || ny >= w.h) continue;
        const j = ny * w.w + nx;
        if (!open(j)) continue;
        const nd = d + cost(j);
        if (nd < (dist.get(j) ?? Infinity)) { dist.set(j, nd); prev.set(j, i); hops.set(j, h + 1); q.push(nd, j); }
      }
    }
    for (const end of doors.keys()) {
      if (!dist.has(end)) continue;
      const tiles = [end];
      for (let i = end; i !== s0;) { i = prev.get(i)!; tiles.push(i); }
      tiles.reverse();
      const seen = new Set<Building>();
      let serves = 0, sc = 0;
      tiles.forEach((i, k) => {
        const x = i % w.w, y = (i - x) / w.w;
        for (let j = y - r; j <= y + r; j++) for (let l = x - r; l <= x + r; l++) for (const b of doors.get(j * w.w + l) ?? []) if (!seen.has(b)) { seen.add(b); serves++; sc += k; }
      });
      const fresh = tiles.filter(i => !w.belt[i]).length;
      if (fresh < P.minTiles || serves < P.minStops) continue;
      if (!best || sc > best.s || (sc === best.s && fresh < best.fresh)) best = { tiles, fresh, serves, s: sc };
    }
  }
  return best;
}

/**
 * Called at each of the planner's looks: every `look_every_seconds`, a self-planning village or town that knows the
 * Conveyor, with fewer belts than one and another per `villagers_per_belt` people, lays the best strip it can pay for.
 */
export function planBelts(S: State, town: Town, dt: number): boolean {
  const B = beltDef(S);
  if (!B || !(B.id in town.knows)) return false;
  // belts in use keep the conveyor in mind, as a building does
  if (town.belts.length) town.knows[B.id].used = S.t;
  town.beltT += dt;
  if (town.beltT < C(S).lookEverySeconds) return false;
  town.beltT = 0;
  const pop = villagers(S).filter(a => a.home?.town === town.id).length;
  if (town.belts.length >= 1 + Math.floor(pop / C(S).villagersPerBelt)) return false;
  const strip = bestBelt(S, town);
  if (!strip) return false;
  for (const g in B.cost) if (have(S, town, g) < B.cost[g] * strip.fresh) { town.planner.status = `Saving ${S.content.goods[g]?.name.toLowerCase() ?? g} for a conveyor`; return false; }
  for (const g in B.cost) take(S, town, g, B.cost[g] * strip.fresh);
  const w = S.world;
  for (const i of strip.tiles) { setBelt(w, i, true); w.tree[i] = 0; }
  const xs = strip.tiles.map(i => i % w.w), ys = strip.tiles.map(i => Math.floor(i / w.w));
  town.belts.push([Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys), S.t]);
  S.stats.beltsLaid++; S.stats.beltTiles += strip.fresh;
  const why = `${town.name} laid a conveyor ${strip.tiles.length} tiles long, beside ${strip.serves} buildings`;
  chronicle(S, town.id, 'belt', why);
  emit(S, 'info', why, true);
  town.planner.status = `Laid a conveyor: ${strip.tiles.length} tiles, ${strip.serves} buildings beside it`;
  town.knows[B.id].used = S.t;
  return true;
}
