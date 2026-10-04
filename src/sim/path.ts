/**
 * A* on the tile grid: 8 directions, roads and paths cheap, grown trees slow, buildings blocked, water only by boat.
 * A building is entered only by its door; someone standing inside one (caught by a new
 * footprint) may walk out through that building.
 */
import type { World } from './types.ts';

interface Buffers { g: Float32Array; came: Int32Array; seen: Uint32Array; closed: Uint32Array; gen: number }
const buffers = new WeakMap<World, Buffers>();

const DIRS: [number, number, number][] = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]];

function cost(w: World, i: number, inside: number): number {
  if (!w.ground[i]) return w.bridge[i] ? w.pathCost : Infinity;
  if (w.ground[i] === 3) return w.rockCost;
  const b = w.bgrid[i];
  if (b !== -1 && !w.door[i] && b !== inside) return Infinity;
  if (w.road[i]) return w.road[i] === 2 ? w.roadCost : w.pathCost;
  if (w.tree[i] === 2) return w.forestCost;
  return 1;
}

export interface PathOptions {
  /** The traveller has a boat with them (they landed here by boat), so they can launch from any shore. */
  launchAnywhere?: boolean;
}

/**
 * Two travel modes: on foot, and rowing. Boats are launched from a dock's door (or from any shore
 * by someone who has one with them) and can land on any shore. Without docks nobody rows, so a world
 * with none gets exactly the routes it always did.
 */
export function findPath(w: World, sx: number, sy: number, gx: number, gy: number, opts: PathOptions = {}): [number, number][] | null {
  const W = w.w, H = w.h, N = W * H, inB = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H;
  w.work.paths++;
  if (!inB(gx, gy) || !inB(sx, sy) || (!w.ground[gy * W + gx] && !w.bridge[gy * W + gx])) { w.work.pathFails++; return null; }
  const s = sy * W + sx, goal = gy * W + gx;
  if (s === goal) return [];
  const rowing = w.docks > 0 || !!opts.launchAnywhere, water = w.waterCost;
  let b = buffers.get(w);
  if (!b || b.g.length < 2 * N) { const n = 2 * N; b = { g: new Float32Array(n), came: new Int32Array(n), seen: new Uint32Array(n), closed: new Uint32Array(n), gen: 0 }; buffers.set(w, b); }
  // only someone trapped on a wall tile (not standing in a doorway) may cross that building to get out
  const gen = ++b.gen, { g, came, seen, closed } = b, inside = w.door[s] ? -1 : w.bgrid[s];
  // the cheapest tile there is, so the estimate never overshoots: a road once any is laid, else a path
  const best = w.roads > 0 ? Math.min(w.roadCost, w.pathCost) : w.pathCost, unit = rowing ? Math.min(best, water) : best;
  const h = (n: number) => { const i = n % N, dx = Math.abs(i % W - gx), dy = Math.abs(((i / W) | 0) - gy); return unit * (Math.max(dx, dy) + 0.414 * Math.min(dx, dy)); };
  const hi: number[] = [], hf: number[] = [];
  const swap = (a: number, c: number) => { [hi[a], hi[c]] = [hi[c], hi[a]]; [hf[a], hf[c]] = [hf[c], hf[a]]; };
  const push = (i: number, f: number) => {
    let n = hi.length; hi.push(i); hf.push(f);
    while (n > 0) { const p = (n - 1) >> 1; if (hf[p] <= hf[n]) break; swap(p, n); n = p; }
  };
  const pop = () => {
    const first = hi[0], li = hi.pop()!, lf = hf.pop()!;
    if (hi.length) {
      hi[0] = li; hf[0] = lf;
      let n = 0;
      for (;;) {
        const l = 2 * n + 1, r = l + 1; let m = n;
        if (l < hi.length && hf[l] < hf[m]) m = l;
        if (r < hi.length && hf[r] < hf[m]) m = r;
        if (m === n) break;
        swap(m, n); n = m;
      }
    }
    return first;
  };
  const relax = (cur: number, ni: number, c: number) => {
    const ng = g[cur] + c;
    if (seen[ni] !== gen || ng < g[ni]) { seen[ni] = gen; closed[ni] = 0; g[ni] = ng; came[ni] = cur; push(ni, ng + h(ni)); }
  };
  const isWater = (i: number) => w.ground[i] === 0;
  // node = tile on foot, or tile + N afloat; someone out on open water (their trip cut short mid-row) is afloat
  const start = !w.ground[s] && !w.bridge[s] ? s + N : s;
  g[start] = 0; seen[start] = gen; came[start] = -1; push(start, h(start));
  let guard = 0;
  // long trips on big maps need room to search: at least the whole map once, on foot
  const limit = Math.max(rowing ? 80000 : 40000, rowing ? 2 * N : N);
  while (hi.length && guard++ < limit) {
    const cur = pop();
    if (closed[cur] === gen) continue;
    closed[cur] = gen;
    w.work.pathNodes++;
    if (cur === goal) {
      const out: [number, number][] = [];
      for (let c = goal; c !== start; c = came[c]) { const t = c % N; out.push([t % W, (t / W) | 0]); }
      return out.reverse();
    }
    const afloat = cur >= N, t = cur % N, cx = t % W, cy = (t / W) | 0;
    for (const [dx, dy, m] of DIRS) {
      const nx = cx + dx, ny = cy + dy;
      if (!inB(nx, ny)) continue;
      const ni = ny * W + nx, diag = dx !== 0 && dy !== 0;
      if (afloat) {
        if (isWater(ni)) {
          // row on, without cutting a corner of land
          if (diag && (!isWater(cy * W + nx) || !isWater(ny * W + cx))) continue;
          relax(cur, ni + N, water * m);
        } else if (!diag) {
          // land on any shore that can be stood on
          const c = cost(w, ni, inside);
          if (c !== Infinity) relax(cur, ni, c);
        }
        continue;
      }
      if (rowing && isWater(ni) && !w.bridge[ni]) {
        // launch from a dock's door, or anywhere if a boat is already with us
        if (!diag && (w.dock[t] || opts.launchAnywhere)) relax(cur, ni + N, water);
        continue;
      }
      const c = cost(w, ni, inside);
      if (c === Infinity) continue;
      // no cutting corners past water or walls
      if (diag && (cost(w, cy * W + nx, inside) === Infinity || cost(w, ny * W + cx, inside) === Infinity)) continue;
      // climbing or descending costs time
      relax(cur, ni, c * m + w.slopeCost * Math.abs(w.height[ni] - w.height[t]));
    }
  }
  w.work.pathFails++;
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
