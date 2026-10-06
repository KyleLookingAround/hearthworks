/** Where buildings can go: shared by the planner and the gate kit. */
import { reachable } from './path.ts';
import { dims, hypot, bp, door, front as frontOf } from './core.ts';
import { canPlace } from './buildings.ts';
import { type State, ZONES, type Building, type Town, type World } from './types.ts';

/** No buildings or roads in the rectangle (roads are kept, not built over; with `paths`, worn paths may be). */
export function clear(S: State, x: number, y: number, w: number, h: number, paths = false): boolean {
  const W = S.world;
  for (let j = y; j < y + h; j++) for (let k = x; k < x + w; k++) {
    if (k < 0 || j < 0 || k >= W.w || j >= W.h) return false;
    const i = j * W.w + k;
    if (W.bgrid[i] !== -1 || W.belt[i] || (W.road[i] && !(paths && W.road[i] === 1))) return false;
  }
  return true;
}

/**
 * Free for `type` with a `gap`-tile ring of open land, so buildings never wall each other in. The ring may be a planned
 * road (open ground, and a door is meant to open onto a road), never a path, and the building never stands on either;
 * except that a building on the shore may stand on and beside worn paths: the shore is where feet wear them, and there
 * is little of it.
 */
export const fits = (S: State, type: string, x: number, y: number, gap = 1, rot = 0) => {
  const B = S.content.blueprints[type], W = S.world, { w: bw, h: bh } = dims(B, rot);
  if (!canPlace(S, type, x, y, rot) || !clear(S, x, y, bw, bh, !!B.shore)) return false;
  for (let j = y - gap; j < y + bh + gap; j++) for (let k = x - gap; k < x + bw + gap; k++) {
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
    if (hypot(x - near.x, y - near.y) > maxDist) continue;
    if (!fits(S, type, x, y)) continue;
    const c = treesAround(S, x, y, r);
    if (c > bc) { bc = c; best = { x, y }; }
  }
  return best;
}

export const NOBUILD = 1 + ZONES.indexOf('nobuild');
const DEPOSITS = ['', 'fertile', 'stone', 'clay', 'fish', 'iron'];

/** Deposit tiles of `kind` within `r` of a point. */
export function depositsNear(W: World, cx: number, cy: number, kind: string, r: number): number {
  const k = DEPOSITS.indexOf(kind);
  let n = 0;
  for (let y = Math.max(0, Math.floor(cy - r)); y <= Math.min(W.h - 1, Math.ceil(cy + r)); y++) for (let x = Math.max(0, Math.floor(cx - r)); x <= Math.min(W.w - 1, Math.ceil(cx + r)); x++) {
    if (W.deposit[y * W.w + x] === k && hypot(x + 0.5 - cx, y + 0.5 - cy) <= r) n++;
  }
  return n;
}

/** Does a footprint touch land the player has zoned for no building? */
export function onNoBuild(W: World, x: number, y: number, w: number, h: number): boolean {
  for (let j = y; j < y + h; j++) for (let k = x; k < x + w; k++) if (k >= 0 && j >= 0 && k < W.w && j < W.h && W.zone[j * W.w + k] === NOBUILD) return true;
  return false;
}

/** Would `type` at (x, y) cut the settlement's first storage yard off from a door it reaches now, or from its own? */
export function cutsOff(S: State, town: Town, type: string, x: number, y: number): boolean {
  const W = S.world, B = S.content.blueprints[type], store = S.bmap.get(town.store);
  if (!store) return false;
  const from = door(store), reach = reachable(W, from.x, from.y);
  const doors = S.buildings.filter(b => !b.dead && !bp(S, b).bridge).map(b => { const d = door(b); return d.y * W.w + d.x; }).filter(i => reach[i]);
  const d = door({ x, y, w: B.w, h: B.h }), front = B.shore ? d.y * W.w + d.x + 1 : (d.y + 1) * W.w + d.x;
  return sealsOff(W, x, y, B.w, B.h, from, doors, front);
}

/** Would a footprint at (x, y) cut storage off from any of `doors`, or from the tile in front of its own door? */
export function sealsOff(W: World, x: number, y: number, w: number, h: number, from: { x: number; y: number }, doors: number[], front: number): boolean {
  const saved: number[] = [];
  for (let j = y; j < y + h; j++) for (let k = x; k < x + w; k++) { const i = j * W.w + k; saved.push(W.bgrid[i]); W.bgrid[i] = -2; }
  const reach = reachable(W, from.x, from.y);
  let n = 0;
  for (let j = y; j < y + h; j++) for (let k = x; k < x + w; k++) W.bgrid[j * W.w + k] = saved[n++];
  return (front >= 0 && !reach[front]) || doors.some(i => !reach[i]);
}

/** Would `type` fit at (x, y) if the buildings in `without` were not there? Lifts them off the map to check. */
export function fitsWithout(S: State, type: string, x: number, y: number, without: Set<Building>, town: Town): boolean {
  const W = S.world, saved: [number, number, number][] = [];
  for (const o of without) {
    for (let j = o.y; j < o.y + o.h; j++) for (let k = o.x; k < o.x + o.w; k++) { const i = j * W.w + k; saved.push([i, W.bgrid[i], W.door[i]]); W.bgrid[i] = -1; W.door[i] = 0; }
    const fo = frontOf(o), f = fo.y * W.w + fo.x;
    W.front[f] = Math.max(0, W.front[f] - 1);
  }
  const ok = fits(S, type, x, y, 0) && !cutsOff(S, town, type, x, y);
  for (const [i, b, dr] of saved) { W.bgrid[i] = b; W.door[i] = dr; }
  for (const o of without) { const fo = frontOf(o); W.front[fo.y * W.w + fo.x]++; }
  return ok;
}
