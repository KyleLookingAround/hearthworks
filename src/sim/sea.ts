import { goToBuilding, moveTo } from './agents.ts';
import { cancelTask } from './logistics.ts';
import { makeRng, valueNoise } from './rng.ts';
import { bp, chronicle, door, villagers } from './core.ts';
import { setOff } from './ships.ts';
import type { Agent, MapDef, State, Town, World } from './types.ts';

/**
 * The sea (Phase 18, second pass): shallows along the shores and reefs out at sea on the sea maps, and charts:
 * with charts on, a settlement knows only the islands it has seen, and settles only on charted land; boats chart
 * what they pass, visitors swap charts, and explorers row out to the islands nobody at home has seen.
 * See design/systems/sea.md.
 */
const Z = (S: State) => S.content.tuning.sea;

/** Tiles from the nearest land (8 directions), up to 255; land is 0. */
function landDistance(w: World): Uint8Array {
  const W = w.w, H = w.h, N = W * H, d = new Uint8Array(N).fill(255), q = new Int32Array(N);
  let head = 0, tail = 0;
  for (let i = 0; i < N; i++) if (w.ground[i]) { d[i] = 0; q[tail++] = i; }
  while (head < tail) {
    const i = q[head++], x = i % W, y = (i / W) | 0;
    if (d[i] >= 254) continue;
    for (let j = -1; j <= 1; j++) for (let k = -1; k <= 1; k++) {
      const xx = x + k, yy = y + j;
      if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
      const n = yy * W + xx;
      if (d[n] > d[i] + 1) { d[n] = d[i] + 1; q[tail++] = n; }
    }
  }
  return d;
}

/** Label the 4-connected components of the tiles `inside` accepts: a label per tile (-1 outside) and each label's size. */
function components(W: number, H: number, inside: (i: number) => boolean): { id: Int32Array; size: number[] } {
  const N = W * H, id = new Int32Array(N).fill(-1), q = new Int32Array(N), size: number[] = [];
  for (let s = 0; s < N; s++) {
    if (id[s] !== -1 || !inside(s)) continue;
    const c = size.length;
    let head = 0, tail = 0, n = 0;
    id[s] = c; q[tail++] = s;
    while (head < tail) {
      const i = q[head++], x = i % W; n++;
      for (const j of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, i - W, i + W]) {
        if (j < 0 || j >= N || id[j] !== -1 || !inside(j)) continue;
        id[j] = c; q[tail++] = j;
      }
    }
    size.push(n);
  }
  return { id, size };
}

/**
 * Shallows and reefs, on maps with a `sea` block, from their own random stream (so the land stays as it was):
 * water within `shallow_tiles` of land is shallow; reefs lie in clumps `reef_from_tiles` to `reef_to_tiles` out,
 * over about `reefs` of that water. A reef never closes off any water from the rest of its sea: reefs that would
 * are washed away until every stretch of water is one again.
 */
export function shapeSea(w: World, M: MapDef, seed: number, T: State['content']['tuning']['sea']) {
  if (!M.sea) return;
  const W = w.w, H = w.h, N = W * H, d = landDistance(w), r = makeRng(seed ^ 0x72656566), noise = valueNoise(r, T.reefCell, W, H);
  for (let i = 0; i < N; i++) {
    if (w.ground[i]) continue;
    const x = i % W, y = (i / W) | 0;
    if (d[i] <= T.shallowTiles) w.sea[i] = 1;
    else if (d[i] >= T.reefFromTiles && d[i] <= T.reefToTiles && noise(x, y) > 1 - M.sea.reefs) w.sea[i] = 2;
  }
  for (let pass = 0; pass < 64; pass++) {
    const all = components(W, H, i => !w.ground[i]), open = components(W, H, i => !w.ground[i] && w.sea[i] !== 2);
    // the biggest stretch of open water in each sea
    const main: number[] = [];
    for (let i = 0; i < N; i++) { const a = all.id[i], o = open.id[i]; if (o >= 0 && (main[a] === undefined || open.size[o] > open.size[main[a]])) main[a] = o; }
    let washed = 0;
    for (let i = 0; i < N; i++) {
      if (w.sea[i] !== 2) continue;
      const x = i % W, a = all.id[i];
      for (const j of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, i - W, i + W]) {
        if (j < 0 || j >= N || open.id[j] < 0 || open.id[j] === main[a]) continue;
        w.sea[i] = 0; washed++; break;
      }
    }
    if (!washed) break;
  }
}

interface Isles { id: Int32Array; count: number }
const isleCache = new WeakMap<World, Isles>();

/**
 * The islands: land joined by land or by shallows (`shallow_tiles` of land on every map, so the banks of a river
 * are one island, and so are islets a stone's throw apart). A label per tile, -1 out at sea. The ground never
 * changes after a world is made, so this is worked out once a world.
 */
export function islesOf(S: State): Isles {
  const w = S.world;
  let I = isleCache.get(w);
  if (!I) {
    const d = landDistance(w), n = Z(S).shallowTiles, c = components(w.w, w.h, i => d[i] <= n);
    I = { id: c.id, count: c.size.length };
    isleCache.set(w, I);
  }
  return I;
}

/** The island under a tile, or -1 for open sea. */
export const isleAt = (S: State, x: number, y: number) => islesOf(S).id[y * S.world.w + x];

/** Every island with land within `sight_tiles` of (x, y), into `out`. */
export function seeAround(S: State, x: number, y: number, out: Set<number>) {
  const w = S.world, R = Z(S).sightTiles, id = islesOf(S).id;
  for (let j = -R; j <= R; j++) for (let k = -R; k <= R; k++) {
    const xx = x + k, yy = y + j;
    if (xx < 0 || yy < 0 || xx >= w.w || yy >= w.h || k * k + j * j > R * R) continue;
    const i = yy * w.w + xx;
    if (w.ground[i] && id[i] >= 0) out.add(id[i]);
  }
}

/** Add islands to a settlement's charts; how many were new to it. */
export function chart(S: State, town: Town, ids: Iterable<number>): number {
  const have = new Set(town.charted);
  let n = 0;
  for (const i of ids) if (i >= 0 && !have.has(i)) { have.add(i); n++; }
  if (n) { town.charted = [...have].sort((a, b) => a - b); S.stats.charted += n; }
  return n;
}

const horizons = new WeakMap<World, Map<number, number[]>>();

/** The islands in sight from an island's shores: every island with land within `sight_tiles` of its land (worked out once). */
export function horizon(S: State, isle: number): number[] {
  const w = S.world;
  let H = horizons.get(w);
  if (!H) { H = new Map(); horizons.set(w, H); }
  let out = H.get(isle);
  if (!out) {
    const id = islesOf(S).id, seen = new Set<number>([isle]), N = w.w * w.h;
    // from its shore tiles only: land beside water
    for (let i = 0; i < N; i++) {
      if (id[i] !== isle || !w.ground[i]) continue;
      const x = i % w.w, y = (i / w.w) | 0;
      if (x > 0 && x < w.w - 1 && y > 0 && y < w.h - 1 && w.ground[i - 1] && w.ground[i + 1] && w.ground[i - w.w] && w.ground[i + w.w]) continue;
      seeAround(S, x, y, seen);
    }
    out = [...seen].sort((a, b) => a - b);
    H.set(isle, out);
  }
  return out;
}

/** What a settlement sees: the islands it has built on, and every island on their horizons. */
function lookOut(S: State, town: Town) {
  const id = islesOf(S).id, mine = new Set<number>();
  for (const b of S.buildings) if (b.town === town.id) { const i = id[b.y * S.world.w + b.x]; if (i >= 0) mine.add(i); }
  for (const i of mine) chart(S, town, horizon(S, i));
}

/** Once a second, with charts on: each settlement looks out from its shores, and one with a dock sends an explorer out now and then. */
export function updateSea(S: State, dt: number) {
  if (!S.charts) return;
  for (const t of S.towns) {
    t.lookT += dt;
    if (t.lookT >= Z(S).lookEverySeconds) { t.lookT = 0; lookOut(S, t); }
    if (t.planner.on && S.t - t.voyageAt >= Z(S).exploreEverySeconds) sendExplorer(S, t);
  }
}

/**
 * An explorer: every `explore_every_seconds` at most, a settlement with a dock of its own sends a grown carrier
 * (never its last) to row for the nearest island it has not charted (following the birds). They land on its
 * shore and row home to chart it, and what they saw on the way. A settlement that wants land to settle
 * (`explore`) sends one whatever its size; any other once it has people to spare for visits.
 */
export function sendExplorer(S: State, t: Town): Agent | null {
  t.voyageAt = S.t;
  const dock = S.buildings.find(b => b.town === t.id && !b.site && bp(S, b).shore);
  if (!dock) return null;
  const people = villagers(S).filter(a => a.home?.town === t.id);
  if (!t.explore && people.length < S.content.tuning.knowledge.visitMinVillagers) return null;
  if (people.some(a => a.visit?.explore && a.visit.from === t.id)) return null;
  const carriers = people.filter(a => a.role === 'carrier' && a.state !== 'visit' && (!S.people || S.t - a.born >= S.content.tuning.people.adultSeconds));
  if (carriers.length < 2) return null;
  const a = carriers.find(c => !c.carry && (c.state === 'idle' || c.state === 'wander' || c.state === 'toSrc'));
  if (!a) return null;
  // the nearest uncharted land a boat can be pulled up on
  const w = S.world, id = islesOf(S).id, known = new Set(t.charted), dd = door(dock);
  let tx = -1, ty = -1, best = Infinity;
  for (let y = 1; y < w.h - 1; y++) for (let x = 1; x < w.w - 1; x++) {
    const i = y * w.w + x;
    if (!w.ground[i] || w.ground[i] === 3 || w.bgrid[i] !== -1 || id[i] < 0 || known.has(id[i])) continue;
    const dist = (x - dd.x) ** 2 + (y - dd.y) ** 2;
    if (dist < best) { best = dist; tx = x; ty = y; }
  }
  t.explore = false;
  if (tx < 0) return null;
  cancelTask(a);
  a.visit = { from: t.id, to: t.id, back: false, carry: {}, boat: true, seen: [], explore: [tx, ty] };
  a.state = 'visit';
  // with ships on, in a boat of its own: with none free, the explorer waits ashore
  if (!setOff(S, a, t, () => moveTo(S, a, tx, ty))) { a.visit = null; a.state = 'idle'; return null; }
  S.stats.voyages++;
  return a;
}

/** With charts on: someone afloat on a visit notes the islands in sight, every third tile or so. */
export function sight(S: State, a: Agent, x: number, y: number) {
  const v = a.visit;
  if (!v || (x + y) % 3) return;
  const seen = new Set(v.seen ?? []);
  seeAround(S, x, y, seen);
  v.seen = [...seen];
}

/**
 * A visitor or porter at the end of a leg: the settlement they reached takes in the charts of the one they came
 * from, and what they saw from the boat. What they saw on the way out they keep for home.
 */
export function swapCharts(S: State, a: Agent, here: Town, there: Town) {
  if (!S.charts || !a.visit) return;
  chart(S, here, [...there.charted, ...(a.visit.seen ?? [])]);
  if (a.visit.back) a.visit.seen = [];
}

/** An explorer at the end of a leg: out, they land and turn for home; home, the settlement charts what they found. */
export function explorerArrives(S: State, a: Agent) {
  const v = a.visit!, home = S.towns[v.from];
  if (!v.back) {
    v.back = true;
    const at = isleAt(S, Math.floor(a.x), Math.floor(a.y));
    if (at >= 0 && !v.seen!.includes(at)) v.seen!.push(at);
    const store = S.bmap.get(home.store);
    if (store && goToBuilding(S, a, store, { launchAnywhere: true })) return;
    // no way back: they make their own way home
    if (store) { const d = door(store); a.x = d.x + 0.5; a.y = d.y + 0.5; a.path = []; }
  }
  const n = chart(S, home, v.seen ?? []);
  if (n) chronicle(S, home.id, 'charted', `An explorer from ${home.name} came home and charted ${n === 1 ? 'an island' : `${n} islands`} across the sea`);
  a.visit = null; a.state = 'idle';
}
