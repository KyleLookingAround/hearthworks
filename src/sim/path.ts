/**
 * A* on the tile grid: 8 directions, roads and paths cheap, grown trees slow, buildings blocked, water only by boat
 * (slowly through shallows, never over a reef).
 * A building is entered only by its door; someone standing inside one (caught by a new
 * footprint) may walk out through that building.
 */
import type { World } from './types.ts';

interface Buffers { g: Float32Array; came: Int32Array; seen: Uint32Array; closed: Uint32Array; gen: number; hi: Int32Array; hf: Float64Array; len: number }
const buffers = new WeakMap<World, Buffers>();

const DIRS: [number, number, number][] = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]];
// the same, flat, for the search's inner loop
const DX = DIRS.map(d => d[0]), DY = DIRS.map(d => d[1]), DM = DIRS.map(d => d[2]);

function cost(w: World, i: number, inside: number): number {
  if (!w.ground[i]) return w.bridge[i] ? w.pathCost : Infinity;
  if (w.ground[i] === 3) return w.rockCost;
  const b = w.bgrid[i];
  if (b !== -1 && !w.door[i] && b !== inside) return Infinity;
  if (w.road[i]) return w.road[i] === 3 ? w.stoneCost : w.road[i] === 2 ? w.roadCost : w.pathCost;
  if (w.tree[i] === 2) return w.forestCost;
  return 1;
}

export interface PathOptions {
  /** The traveller has a boat with them (they landed here by boat), so they can launch from any shore. */
  launchAnywhere?: boolean;
}

/**
 * Searches that found no way, kept as everything they could reach (on foot, and afloat at N + tile). Anyone starting
 * inside one of these, by the same rules, reaches nothing outside it: a search for a tile beyond it fails at once.
 * Only searches that ran out of tiles count (not those cut short at the limit), and only from a start that is not
 * trapped in a building (which may walk out through its own walls). Cleared whenever the ground, a building's
 * footprint, a door, a dock or a bridge changes. Derived, never saved.
 */
const cutOff = new WeakMap<World, { launch: boolean; reach: Uint8Array }[]>();
/** The tiles anyone may walk, row or land on have changed: forget every search that found no way. */
export function reshaped(w: World) { cutOff.delete(w); }

/**
 * Two travel modes: on foot, and rowing. Boats are launched from a dock's door (or from any shore
 * by someone who has one with them) and can land on any shore. Without docks nobody rows, so a world
 * with none gets exactly the routes it always did.
 */
export function findPath(w: World, sx: number, sy: number, gx: number, gy: number, opts: PathOptions = {}): [number, number][] | null {
  const W = w.w, H = w.h, N = W * H;
  w.work.paths++;
  if (gx < 0 || gy < 0 || gx >= W || gy >= H || sx < 0 || sy < 0 || sx >= W || sy >= H || (!w.ground[gy * W + gx] && !w.bridge[gy * W + gx])) { w.work.pathFails++; return null; }
  const s = sy * W + sx, goal = gy * W + gx;
  if (s === goal) return [];
  const launch = !!opts.launchAnywhere, rowing = w.docks > 0 || launch, water = w.waterCost;
  let b = buffers.get(w);
  if (!b || b.g.length < 2 * N) { const n = 2 * N; b = { g: new Float32Array(n), came: new Int32Array(n), seen: new Uint32Array(n), closed: new Uint32Array(n), gen: 0, hi: new Int32Array(1024), hf: new Float64Array(1024), len: 0 }; buffers.set(w, b); }
  // only someone trapped on a wall tile (not standing in a doorway) may cross that building to get out
  const gen = ++b.gen, { g, came, seen, closed } = b, inside = w.door[s] ? -1 : w.bgrid[s];
  // node = tile on foot, or tile + N afloat; someone out on open water (their trip cut short mid-row) is afloat
  const start = !w.ground[s] && !w.bridge[s] ? s + N : s;
  // a search already known to find no way from here
  const known = inside === -1 ? cutOff.get(w) : undefined;
  if (known) for (const k of known) if (k.launch === launch && k.reach[start] && !k.reach[goal]) { w.work.pathFails++; return null; }
  // the cheapest tile there is, so the estimate never overshoots: a stone road or a road once any is laid, else a path
  const best = w.stone > 0 ? Math.min(w.stoneCost, w.roadCost, w.pathCost) : w.roads > 0 ? Math.min(w.roadCost, w.pathCost) : w.pathCost, unit = rowing ? Math.min(best, water) : best;
  // the open list: a binary heap of nodes by estimated cost (in `b`, grown as needed)
  const H0 = b;
  H0.len = 0;
  const ground = w.ground, bridge = w.bridge, sea = w.sea, bgrid = w.bgrid, door = w.door, road = w.road, tree = w.tree, height = w.height, dock = w.dock;
  const slope = w.slopeCost, shallow = water * w.shallowCost, pathCost = w.pathCost, roadCost = w.roadCost, stoneCost = w.stoneCost, rockCost = w.rockCost, forestCost = w.forestCost;
  // step to node `ni` (tile at nx, ny) from a node `gc` away from the start, at cost `c`
  const relax = (cur: number, gc: number, ni: number, nx: number, ny: number, c: number) => {
    const ng = gc + c;
    if (seen[ni] !== gen || ng < g[ni]) {
      seen[ni] = gen; closed[ni] = 0; g[ni] = ng; came[ni] = cur;
      const dx = Math.abs(nx - gx), dy = Math.abs(ny - gy), f = ng + unit * (Math.max(dx, dy) + 0.414 * Math.min(dx, dy));
      let hi = H0.hi, hf = H0.hf, n = H0.len++;
      if (n === hi.length) { const xi = new Int32Array(n * 2), xf = new Float64Array(n * 2); xi.set(hi); xf.set(hf); H0.hi = hi = xi; H0.hf = hf = xf; }
      while (n > 0) { const p = (n - 1) >> 1, pf = hf[p]; if (pf <= f) break; hi[n] = hi[p]; hf[n] = pf; n = p; }
      hi[n] = ni; hf[n] = f;
    }
  };
  {
    g[start] = 0; seen[start] = gen; came[start] = -1;
    const t = start % N, dx = Math.abs(t % W - gx), dy = Math.abs(((t / W) | 0) - gy);
    H0.hi[0] = start; H0.hf[0] = unit * (Math.max(dx, dy) + 0.414 * Math.min(dx, dy)); H0.len = 1;
  }
  let guard = 0;
  // long trips on big maps need room to search: at least the whole map once, on foot
  const limit = Math.max(rowing ? 80000 : 40000, rowing ? 2 * N : N);
  while (H0.len && guard++ < limit) {
    // take the cheapest off the heap: the last moves to the top and sinks
    const hi = H0.hi, hf = H0.hf, cur = hi[0], len = --H0.len;
    if (len) {
      const li = hi[len], lf = hf[len];
      let n = 0;
      for (;;) {
        const l = 2 * n + 1, r = l + 1;
        let m = n, mf = lf;
        if (l < len && hf[l] < mf) { m = l; mf = hf[l]; }
        if (r < len && hf[r] < mf) { m = r; mf = hf[r]; }
        if (m === n) break;
        hi[n] = hi[m]; hf[n] = mf; n = m;
      }
      hi[n] = li; hf[n] = lf;
    }
    if (closed[cur] === gen) continue;
    closed[cur] = gen;
    w.work.pathNodes++;
    if (cur === goal) {
      const out: [number, number][] = [];
      for (let c = goal; c !== start; c = came[c]) { const t = c % N; out.push([t % W, (t / W) | 0]); }
      return out.reverse();
    }
    const afloat = cur >= N, t = afloat ? cur - N : cur, cx = t % W, cy = (t / W) | 0, gc = g[cur], ht = height[t];
    // which of the four sides can be stood on (bit k for side k), found as they are stepped to: the corners of the diagonal steps
    let sides = 0;
    for (let k = 0; k < 8; k++) {
      const dx = DX[k], dy = DY[k];
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const ni = ny * W + nx, diag = k >= 4;
      if (afloat) {
        // reefs are never rowed over; shallows are rowed slowly
        if (ground[ni] === 0 && sea[ni] !== 2) {
          // row on, without cutting a corner of land
          if (diag && (ground[cy * W + nx] !== 0 || sea[cy * W + nx] === 2 || ground[ny * W + cx] !== 0 || sea[ny * W + cx] === 2)) continue;
          relax(cur, gc, ni + N, nx, ny, (sea[ni] === 1 ? shallow : water) * DM[k]);
        } else if (!diag) {
          // land on any shore that can be stood on
          const c = cost(w, ni, inside);
          if (c !== Infinity) relax(cur, gc, ni, nx, ny, c);
        }
        continue;
      }
      // no cutting corners past water or walls
      if (diag && (!(sides & (dx > 0 ? 1 : 2)) || !(sides & (dy > 0 ? 4 : 8)))) continue;
      const gr = ground[ni];
      if (rowing && gr === 0 && sea[ni] !== 2 && !bridge[ni]) {
        // launch from a dock's door, or anywhere if a boat is already with us
        if (!diag && (dock[t] || launch)) relax(cur, gc, ni + N, nx, ny, sea[ni] === 1 ? shallow : water);
        continue;
      }
      // (the cost of the tile, as cost() gives it)
      let c: number;
      if (!gr) { if (!bridge[ni]) continue; c = pathCost; }
      else if (gr === 3) c = rockCost;
      else {
        const o = bgrid[ni];
        if (o !== -1 && !door[ni] && o !== inside) continue;
        const r = road[ni];
        c = r ? (r === 3 ? stoneCost : r === 2 ? roadCost : pathCost) : tree[ni] === 2 ? forestCost : 1;
      }
      if (!diag) sides |= 1 << k;
      // climbing or descending costs time
      relax(cur, gc, ni, nx, ny, c * DM[k] + slope * Math.abs(height[ni] - ht));
    }
  }
  w.work.pathFails++;
  // ran out of tiles: everything reachable from here was searched, and remembered
  if (!H0.len && inside === -1) {
    const reach = new Uint8Array(2 * N);
    for (let i = 0; i < 2 * N; i++) if (closed[i] === gen) reach[i] = 1;
    const list = cutOff.get(w) ?? [];
    list.push({ launch, reach });
    if (list.length > 4) list.shift();
    cutOff.set(w, list);
  }
  return null;
}

/** Every tile reachable on foot from (sx, sy): open land, roads and building doors, 4-connected (corners are never cut). */
export function reachable(w: World, sx: number, sy: number): Uint8Array {
  const W = w.w, N = W * w.h, seen = new Uint8Array(N), q = new Int32Array(N);
  const open = (i: number) => (w.ground[i] > 0 && (w.bgrid[i] === -1 || w.door[i] === 1)) || w.bridge[i] === 1;
  const s = sy * W + sx;
  if (sx < 0 || sy < 0 || sx >= W || sy >= w.h) return seen;
  let head = 0, tail = 0;
  seen[s] = 1; q[tail++] = s;
  while (head < tail) {
    const i = q[head++], x = i % W;
    for (const j of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, i - W, i + W]) {
      if (j < 0 || j >= N || seen[j] || !open(j)) continue;
      seen[j] = 1; q[tail++] = j;
    }
  }
  return seen;
}
