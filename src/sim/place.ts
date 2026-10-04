/** Where buildings can go: shared by the planner and the gate kit. */
import { canPlace } from './world.ts';
import type { State } from './types.ts';

/** No buildings or roads in the rectangle (roads are kept, not built over; with `paths`, worn paths may be). */
export function clear(S: State, x: number, y: number, w: number, h: number, paths = false): boolean {
  const W = S.world;
  for (let j = y; j < y + h; j++) for (let k = x; k < x + w; k++) {
    if (k < 0 || j < 0 || k >= W.w || j >= W.h) return false;
    const i = j * W.w + k;
    if (W.bgrid[i] !== -1 || (W.road[i] && !(paths && W.road[i] === 1))) return false;
  }
  return true;
}

/**
 * Free for `type` with a `gap`-tile ring of open land, so buildings never wall each other in. The ring may be a planned
 * road (open ground, and a door is meant to open onto a road), never a path, and the building never stands on either;
 * except that a building on the shore may stand on and beside worn paths: the shore is where feet wear them, and there
 * is little of it.
 */
export const fits = (S: State, type: string, x: number, y: number, gap = 1) => {
  const B = S.content.blueprints[type], W = S.world;
  if (!canPlace(S, type, x, y) || !clear(S, x, y, B.w, B.h, !!B.shore)) return false;
  for (let j = y - gap; j < y + B.h + gap; j++) for (let k = x - gap; k < x + B.w + gap; k++) {
    if (k < 0 || j < 0 || k >= W.w || j >= W.h) return false;
    const i = j * W.w + k;
    if (W.bgrid[i] !== -1 || (W.road[i] === 1 && !B.shore)) return false;
  }
  return true;
};

/** Grown trees within `r` tiles of the tile at (x, y). */
export function treesAround(S: State, x: number, y: number, r: number): number {
  const W = S.world;
  let c = 0;
  for (let j = -r; j <= r; j++) for (let k = -r; k <= r; k++) {
    const yy = y + j, xx = x + k;
    if (yy >= 0 && yy < W.h && xx >= 0 && xx < W.w && W.tree[yy * W.w + xx] === 2) c++;
  }
  return c;
}

/** First free spot for `type`, spiralling out from `near`. */
export function findSpot(S: State, type: string, near: { x: number; y: number }, maxR = 14): { x: number; y: number } | null {
  const B = S.content.blueprints[type];
  const ox = Math.round(near.x - B.w / 2), oy = Math.round(near.y - B.h / 2);
  for (let r = 0; r <= maxR; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
    const x = ox + dx, y = oy + dy;
    if (fits(S, type, x, y)) return { x, y };
  }
  return null;
}

/** Spot within `maxDist` of `near` with the most grown trees in harvest range. */
export function treeSpot(S: State, type: string, near: { x: number; y: number }, maxDist = 12): { x: number; y: number } | null {
  const B = S.content.blueprints[type], r = B.harvest?.radius ?? 5, W = S.world;
  let best: { x: number; y: number } | null = null, bc = -1;
  for (let y = 1; y < W.h - B.h; y++) for (let x = 1; x < W.w - B.w; x++) {
    if (Math.hypot(x - near.x, y - near.y) > maxDist) continue;
    if (!fits(S, type, x, y)) continue;
    const c = treesAround(S, x, y, r);
    if (c > bc) { bc = c; best = { x, y }; }
  }
  return best;
}
