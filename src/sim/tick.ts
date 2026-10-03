import { assignWorkers, makeAgent, nearestStore, updateAgent } from './agents.ts';
import { updateBuilding } from './production.ts';
import { plan } from './planner.ts';
import { updateKnowledge } from './knowledge.ts';
import { bp, door, emit, villagers } from './world.ts';
import type { State } from './types.ts';

/**
 * Mood per settlement: the share of its villagers living in a house with food on the shelf
 * (hungry houses count 0, empty shelves 0.6). S.mood is the same over the whole world.
 */
export function computeMood(S: State) {
  const pop = S.towns.map(() => 0), fed = S.towns.map(() => 0);
  for (const b of S.buildings) {
    const B = bp(S, b);
    if (!B.homes || b.site) continue;
    const r = b.residents.length, food = Object.keys(B.keepStocked)[0];
    pop[b.town] += r;
    if (b.hunger > 0) continue;
    fed[b.town] += (b.inv[food] || 0) > 0 ? r : r * 0.6;
  }
  S.towns.forEach((t, i) => { t.mood = pop[i] ? fed[i] / pop[i] : 1; });
  const P = pop.reduce((s, n) => s + n, 0), F = fed.reduce((s, n) => s + n, 0);
  S.mood = P ? F / P : 1;
  S.stats.peakVillagers = Math.max(S.stats.peakVillagers, villagers(S).length);
}

/**
 * Every settlement happy enough to draw people, with a free bed, gets a newcomer: villages grow
 * side by side, so a world with more settlements grows faster.
 */
function migrate(S: State) {
  const freeBeds = (b: (typeof S.buildings)[number]) => { const B = bp(S, b); return B.homes && !b.site ? B.homes - b.residents.length : 0; };
  for (const t of S.towns) {
    if (t.mood < S.content.tuning.needs.migrateMinMood) continue;
    const house = S.buildings.find(b => b.town === t.id && freeBeds(b) > 0);
    if (!house) continue;
    const from = nearestStore(S, house) ?? house, d = door(from);
    const a = makeAgent(S, 'villager', d.x + 0.5, d.y + 0.5);
    a.home = house; house.residents.push(a.id);
    S.stats.arrivals++;
    emit(S, 'good', `A newcomer moved to ${t.name}`, true);
  }
}

/** Advance the simulation by dt game seconds. Deterministic for a given seed and command sequence. */
export function tick(S: State, dt: number) {
  S.t += dt;
  const w = S.world, grow = S.content.tuning.map.treeGrowSeconds;
  for (let i = 0; i < w.tree.length; i++) if (w.tree[i] === 1) { w.grow[i] += dt; if (w.grow[i] >= grow) w.tree[i] = 2; }
  for (const b of [...S.buildings]) if (!b.dead) updateBuilding(S, b, dt);
  for (const a of [...S.agents]) if (!a.dead) updateAgent(S, a, dt);
  S.secT += dt;
  if (S.secT >= 1) { S.secT -= 1; assignWorkers(S); computeMood(S); updateKnowledge(S, 1); }
  plan(S, dt);
  S.migT += dt;
  if (S.migT >= S.content.tuning.needs.migrantEverySeconds) { S.migT = 0; migrate(S); }
}

export const STEP = 0.1;

/** Run whole fixed steps for `seconds` of game time. */
export function runFor(S: State, seconds: number, each?: (S: State) => void) {
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i++) { tick(S, STEP); each?.(S); }
}
