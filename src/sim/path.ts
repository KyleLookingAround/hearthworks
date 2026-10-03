/** A* on the tile grid: 8 directions, roads cheap, grown trees slow, water blocked. */
import type { World } from './types.ts';

interface Buffers { g: Float32Array; came: Int32Array; seen: Uint32Array; closed: Uint32Array; gen: number }
const buffers = new WeakMap<World, Buffers>();

const DIRS: [number, number, number][] = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]];
const ROAD_COST = 0.59;

function cost(w: World, i: number): number {
  if (!w.ground[i]) return Infinity;
  if (w.road[i]) return ROAD_COST;
  if (w.tree[i] === 2) return 1.5;
  return 1;
}

export function findPath(w: World, sx: number, sy: number, gx: number, gy: number): [number, number][] | null {
  const W = w.w, H = w.h, inB = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H;
  if (!inB(gx, gy) || !inB(sx, sy) || !w.ground[gy * W + gx]) return null;
  const s = sy * W + sx, goal = gy * W + gx;
  if (s === goal) return [];
  let b = buffers.get(w);
  if (!b) { const n = W * H; b = { g: new Float32Array(n), came: new Int32Array(n), seen: new Uint32Array(n), closed: new Uint32Array(n), gen: 0 }; buffers.set(w, b); }
  const gen = ++b.gen, { g, came, seen, closed } = b;
  const h = (i: number) => { const dx = Math.abs(i % W - gx), dy = Math.abs(((i / W) | 0) - gy); return ROAD_COST * (Math.max(dx, dy) + 0.414 * Math.min(dx, dy)); };
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
  g[s] = 0; seen[s] = gen; came[s] = -1; push(s, h(s));
  let guard = 0;
  while (hi.length && guard++ < 40000) {
    const cur = pop();
    if (closed[cur] === gen) continue;
    closed[cur] = gen;
    if (cur === goal) {
      const out: [number, number][] = [];
      for (let c = goal; c !== s; c = came[c]) out.push([c % W, (c / W) | 0]);
      return out.reverse();
    }
    const cx = cur % W, cy = (cur / W) | 0;
    for (const [dx, dy, m] of DIRS) {
      const nx = cx + dx, ny = cy + dy;
      if (!inB(nx, ny)) continue;
      const ni = ny * W + nx, c = cost(w, ni);
      if (c === Infinity) continue;
      if (dx && dy && (!w.ground[cy * W + nx] || !w.ground[ny * W + cx])) continue;
      const ng = g[cur] + c * m;
      if (seen[ni] !== gen || ng < g[ni]) { seen[ni] = gen; closed[ni] = 0; g[ni] = ng; came[ni] = cur; push(ni, ng + h(ni)); }
    }
  }
  return null;
}
