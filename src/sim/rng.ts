/** Seeded PRNG (mulberry32). State is a plain number so it serialises with the save. */
export interface Rng { s: number }

export const makeRng = (seed: number): Rng => ({ s: seed | 0 });

export function rand(r: Rng): number {
  r.s = (r.s + 0x6D2B79F5) | 0;
  let t = Math.imul(r.s ^ (r.s >>> 15), 1 | r.s);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Smooth 2D value noise over a grid of random lattice values. */
export function valueNoise(r: Rng, cell: number, w: number, h: number): (x: number, y: number) => number {
  const gw = Math.ceil(w / cell) + 2, gh = Math.ceil(h / cell) + 2;
  const g = new Float32Array(gw * gh);
  for (let i = 0; i < g.length; i++) g[i] = rand(r);
  const sm = (t: number) => t * t * (3 - 2 * t);
  return (x, y) => {
    const fx = x / cell, fy = y / cell, ix = Math.floor(fx), iy = Math.floor(fy), tx = sm(fx - ix), ty = sm(fy - iy);
    const a = g[iy * gw + ix], b = g[iy * gw + ix + 1], c = g[(iy + 1) * gw + ix], d = g[(iy + 1) * gw + ix + 1];
    return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
  };
}

/** Stable per-tile pseudo-random value in [0, 1), for visual variation only. */
export const hash01 = (i: number): number => ((((i + 1) * 2654435761) >>> 0) / 4294967296);
