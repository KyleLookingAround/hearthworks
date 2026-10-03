/**
 * What a home's surroundings are like, 0 (grim) to 1 (lovely): `base`, plus trees and water nearby,
 * minus noise from workplaces with a `nuisance` block, crowding by other buildings and open building
 * sites. Derived from the world each time it is asked for, so it is never saved.
 */
import { bp, ctr } from './world.ts';
import type { Building, State } from './types.ts';

export interface Surroundings { score: number; trees: number; water: number; noise: number; crowd: number; sites: number }

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

export function surroundings(S: State, home: Building): Surroundings {
  const T = S.content.tuning.surroundings, w = S.world, c = ctr(home);
  let trees = 0, water = 0;
  const R = Math.max(T.treeRadius, T.waterRadius);
  for (let y = Math.floor(c.y - R); y <= Math.ceil(c.y + R); y++) for (let x = Math.floor(c.x - R); x <= Math.ceil(c.x + R); x++) {
    if (x < 0 || y < 0 || x >= w.w || y >= w.h) continue;
    const d = Math.hypot(x + 0.5 - c.x, y + 0.5 - c.y), i = y * w.w + x;
    if (d <= T.treeRadius && w.tree[i] === 2) trees++;
    if (d <= T.waterRadius && !w.ground[i]) water = 1;
  }
  let noise = 0, crowd = 0, sites = 0;
  for (const b of S.buildings) {
    if (b === home) continue;
    const d = Math.hypot(ctr(b).x - c.x, ctr(b).y - c.y), N = bp(S, b).nuisance;
    if (N && !b.site && d <= N.radius) noise += N.amount;
    if (d <= T.crowdRadius) { crowd++; if (b.site) sites++; }
  }
  const treeScore = Math.min(T.treeMax, trees * T.treeAmenity), waterScore = water * T.waterAmenity;
  const score = clamp01(T.base + treeScore + waterScore - noise - crowd * T.crowdPenalty - sites * T.sitePenalty);
  return { score, trees: treeScore, water: waterScore, noise, crowd: crowd * T.crowdPenalty, sites: sites * T.sitePenalty };
}

/** Is this spot within any finished or planned noisy building's reach? */
export function inNuisance(S: State, p: { x: number; y: number }, except?: Building): boolean {
  return S.buildings.some(b => { const N = bp(S, b).nuisance; return !!N && b !== except && Math.hypot(ctr(b).x - p.x, ctr(b).y - p.y) <= N.radius; });
}

/** Homes within reach of a noisy building: what the planner keeps at zero. */
export const homesInNuisance = (S: State) => S.buildings.filter(b => bp(S, b).homes && !b.site && inNuisance(S, ctr(b), b)).length;
