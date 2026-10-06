import type { BlueprintDef, World } from './types.ts';
import { caches } from './caches.ts';

/**
 * Saplings to grow, kept with the world's caches so a tick does not scan every tile. Derived, never saved:
 * rebuilt from the tree grid when missing (a new or loaded world). Each sapling grows on its own, so
 * the order they are visited in never matters.
 */
export function saplings(w: World): Set<number> {
  const C = caches(w);
  let s = C.saplings;
  if (!s) { s = C.saplings = new Set(); for (let i = 0; i < w.tree.length; i++) if (w.tree[i] === 1) s.add(i); }
  return s;
}
export function plant(w: World, i: number) { w.tree[i] = 1; w.grow[i] = 0; saplings(w).add(i); }

/**
 * The tiles feet have worn and that have not yet faded back, kept with the world's caches so fading them does not scan
 * every tile. Derived, never saved: rebuilt from the wear grid when missing. Each tile fades on its own.
 */
export function worn(w: World): Set<number> {
  const C = caches(w);
  let s = C.worn;
  if (!s) { s = C.worn = new Set(); for (let i = 0; i < w.wear.length; i++) if (w.wear[i] > 0) s.add(i); }
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
