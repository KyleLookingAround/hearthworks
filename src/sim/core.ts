import type { Agent, Building, GameEvent, State, Town, World } from './types.ts';

/*
 * The plain helpers every part of the simulation uses: the map's bounds, footprints and doors, distances, a
 * building's blueprint, counts of villagers and buildings, which settlement a place or person belongs to, and
 * the news and history a settlement writes. No simulation imports, so it sits beneath everything else.
 */

export const inB = (w: World, x: number, y: number) => x >= 0 && y >= 0 && x < w.w && y < w.h;
/** The way each facing looks: 0 south, 1 west, 2 north, 3 east. */
export const FACING: readonly (readonly [number, number])[] = [[0, 1], [-1, 0], [0, -1], [1, 0]];
/** A blueprint's footprint turned to a facing: a quarter turn swaps its width and height. */
export const dims = (B: { w: number; h: number }, rot = 0) => (rot % 2 ? { w: B.h, h: B.w } : { w: B.w, h: B.h });
type Placed = { x: number; y: number; w: number; h: number; rot?: number; doorAt?: { x: number; y: number } | null };
/**
 * The door: the middle of the side the building faces (the bottom row, facing south), where the south door lands when
 * the building is turned about its centre. The tile beyond it (the door front) must stay open.
 */
export const door = (b: Placed) => {
  if (b.doorAt) return b.doorAt;
  switch (b.rot ?? 0) {
    case 1: return { x: b.x, y: b.y + Math.floor(b.h / 2) };
    // turned half way or three quarters, the door stays where the turned building's south door was (mirrored on an even side)
    case 2: return { x: b.x + b.w - 1 - Math.floor(b.w / 2), y: b.y };
    case 3: return { x: b.x + b.w - 1, y: b.y + b.h - 1 - Math.floor(b.h / 2) };
    default: return { x: b.x + Math.floor(b.w / 2), y: b.y + b.h - 1 };
  }
};
/** The door front: the tile beyond the door, the way the building faces. */
export const front = (b: Placed) => { const d = door(b), f = FACING[b.rot ?? 0]; return { x: d.x + f[0], y: d.y + f[1] }; };
/** Beside the door, to its left as one looks out (east of a dock facing south): where people reach a dock that opens onto water. */
export const beside = (b: Placed) => { const d = door(b), f = FACING[b.rot ?? 0]; return { x: d.x + f[1], y: d.y - f[0] }; };
/**
 * The length of (x, y), exactly as V8's Math.hypot gives it (the same scaling by the larger and Kahan sum of squares,
 * step for step: tests/sim.test.ts checks every bit), without the array Math.hypot allocates for its arguments on every
 * call. The sim measures many distances.
 */
export function hypot(x: number, y: number): number {
  const ax = Math.abs(x), ay = Math.abs(y);
  if (ax === Infinity || ay === Infinity) return Infinity;
  if (ax !== ax || ay !== ay) return NaN;
  const max = ax > ay ? ax : ay;
  if (max === 0) return 0;
  const a = ax / max, b = ay / max;
  let sum = 0, comp = 0, s = a * a - comp, p = sum + s;
  comp = (p - sum) - s; sum = p;
  s = b * b - comp; p = sum + s;
  comp = (p - sum) - s; sum = p;
  return Math.sqrt(sum) * max;
}
export const ctr = (b: { x: number; y: number; w: number; h: number }) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });
export const distAB = (a: { x: number; y: number }, b: Building) => { const p = ctr(b); return hypot(a.x - p.x, a.y - p.y); };
export const distBB = (a: Building, b: Building) => { const p = ctr(a), q = ctr(b); return hypot(p.x - q.x, p.y - q.y); };
export const add = (o: Record<string, number>, k: string, v: number) => { o[k] = (o[k] || 0) + v; if (Math.abs(o[k]) < 1e-9) o[k] = 0; };
export const bp = (S: State, b: Building) => S.content.blueprints[b.type];
/** The steward's priority on one of a settlement's needs (a good, 'beds', 'hauling'...): 1 normal. */
export const priorityOf = (t: Town | undefined, key: string): number => t?.levers.priority[key] ?? 1;
export const villagers = (S: State): Agent[] => S.agents.filter(a => a.kind === 'villager');
export const hasBuilt = (S: State, type: string) => S.buildings.some(b => b.type === type && !b.site);
export const countBuilt = (S: State, type: string) => S.buildings.filter(b => b.type === type && !b.site).length;

/** Write a line of a settlement's history. */
export function chronicle(S: State, town: number, kind: string, text: string) {
  S.chronicle.push({ t: S.t, town, kind, text });
}

export function emit(S: State, kind: GameEvent['kind'], text: string, minor = false) {
  S.events.push({ kind, text, t: S.t, minor });
  if (S.events.length > 200) S.events.splice(0, S.events.length - 200);
}

/** The settlement whose first storage yard is nearest to a point. */
export function nearestTown(S: State, x: number, y: number): number {
  let best = 0, bd = Infinity;
  for (const tn of S.towns) {
    const s = S.bmap.get(tn.store);
    if (!s) continue;
    const c = ctr(s), d = hypot(c.x - x, c.y - y);
    if (d < bd) { bd = d; best = tn.id; }
  }
  return best;
}

/** The settlement a villager or bot belongs to. */
export const townOf = (S: State, a: Agent) => a.home?.town ?? a.depot?.town ?? nearestTown(S, a.x, a.y);
