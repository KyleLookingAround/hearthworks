import { assignWorkers, makeAgent, nearestStore, updateAgent } from './agents.ts';
import { cold, homeTier, updateBuilding } from './production.ts';
import { formOf } from './planner.ts';
import { plan } from './planner.ts';
import { updateKnowledge } from './knowledge.ts';
import { bp, chronicle, door, emit, foodsOf, saplings, seasonOf, storesOnTrack, villagers } from './world.ts';
import type { State } from './types.ts';
import { surroundings } from './surroundings.ts';

/**
 * Mood per settlement: the share of its villagers living in a house with food on the shelf
 * (hungry houses count 0, empty shelves 0.6). S.mood is the same over the whole world.
 */
export function computeMood(S: State) {
  const n = S.towns.length, pop = new Array(n).fill(0), fed = new Array(n).fill(0), around = new Array(n).fill(0), tier = new Array(n).fill(0), chill = new Array(n).fill(0);
  // the cold of winter: mood loses up to `cold_penalty` for the share of people in homes with no fire
  const cp = S.content.tuning.seasons.coldPenalty, chilled = (c: number, p: number) => (p ? cp * c / p : 0);
  // variety: homes above the first tier lift mood by up to `variety_bonus`; lacking comforts never lowers it
  const variety = (t: number, p: number) => p ? S.content.tuning.needs.varietyBonus * Math.max(0, t / p - 1) / 2 : 0;
  const wgt = S.content.tuning.needs.surroundingsWeight;
  for (const b of S.buildings) {
    const B = bp(S, b);
    if (!B.homes || b.site) continue;
    const r = b.residents.length;
    if (!r) continue;
    pop[b.town] += r;
    if (wgt > 0) around[b.town] += r * surroundings(S, b).score;
    tier[b.town] += r * Math.max(1, homeTier(S, b));
    if (b.hunger > 0) continue;
    if (cold(S, b)) chill[b.town] += r;
    fed[b.town] += foodsOf(S, b).some(f => (b.inv[f] || 0) > 0) ? r : r * 0.6;
  }
  const blend = (f: number, a: number) => f * (1 - wgt) + a * wgt;
  S.towns.forEach((t, i) => { t.fed = pop[i] ? fed[i] / pop[i] : 1; t.mood = pop[i] ? Math.max(0, Math.min(1, blend(t.fed, around[i] / pop[i]) + variety(tier[i], pop[i])) - chilled(chill[i], pop[i])) : 1; });
  // each settlement's form follows its people, whether or not it plans for itself
  for (const t of S.towns) { const f = formOf(S, t); if (f !== t.form) { chronicle(S, t.id, 'form', `${t.name} became a ${f}`); t.form = f; } }
  const P = pop.reduce((s, k) => s + k, 0), F = fed.reduce((s, k) => s + k, 0), A = around.reduce((s, k) => s + k, 0);
  S.fed = P ? F / P : 1;
  const V = tier.reduce((s, k) => s + k, 0);
  const C = chill.reduce((s, k) => s + k, 0);
  S.mood = P ? Math.max(0, Math.min(1, blend(S.fed, A / P) + variety(V, P)) - chilled(C, P)) : 1;
  S.stats.peakVillagers = Math.max(S.stats.peakVillagers, villagers(S).length);
}

/**
 * Every settlement happy enough to draw people, with a free bed, gets a newcomer: villages grow
 * side by side, so a world with more settlements grows faster.
 */
function migrate(S: State) {
  const freeBeds = (b: (typeof S.buildings)[number]) => { const B = bp(S, b); return B.homes && !b.site ? B.homes - b.residents.length : 0; };
  // with seasons on, newcomers travel in spring and summer only
  const s = seasonOf(S);
  if (s === 'autumn' || s === 'winter') return;
  for (const t of S.towns) {
    if (t.mood < S.content.tuning.needs.migrateMinMood) continue;
    // in summer a newcomer comes only while the stores keep pace with what one more mouth would need by the frost
    if (s === 'summer' && !storesOnTrack(S, t, 1)) continue;
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
  const young = saplings(w);
  for (const i of young) {
    if (w.tree[i] !== 1) { young.delete(i); continue; }
    w.grow[i] += dt;
    if (w.grow[i] >= grow) { w.tree[i] = 2; young.delete(i); }
  }
  for (const b of [...S.buildings]) if (!b.dead) updateBuilding(S, b, dt);
  for (const a of [...S.agents]) if (!a.dead) updateAgent(S, a, dt);
  S.secT += dt;
  if (S.secT >= 1) {
    S.secT -= 1; assignWorkers(S); computeMood(S); updateKnowledge(S, 1);
    if (S.seasons && Math.floor(S.t) % Math.round(S.content.tuning.seasons.yearSeconds / 4) === 0 && Math.floor(S.t) > 0) {
      const s = seasonOf(S)!;
      emit(S, s === 'winter' ? 'bad' : 'info', s === 'winter' ? 'Winter has come: the fields rest and homes burn firewood' : `${s[0].toUpperCase()}${s.slice(1)} has come`);
      for (const t of S.towns) chronicle(S, t.id, 'season', `${s[0].toUpperCase()}${s.slice(1)} came to ${t.name} in year ${Math.floor(S.t / S.content.tuning.seasons.yearSeconds) + 1}`);
    }
    // once a minute, food left out in stores that do not keep it spoils: the whole units of `spoils` of the pile
    if (Math.floor(S.t) % 60 === 0) for (const b of S.buildings) {
      const B = bp(S, b);
      if (!B.storage || b.site) continue;
      for (const k in b.inv) {
        const G = S.content.goods[k];
        if (!G?.spoils || B.keeps?.includes(k)) continue;
        const lost = Math.min(Math.floor((b.inv[k] - (b.reserved[k] || 0)) * G.spoils), b.inv[k] - (b.reserved[k] || 0));
        if (lost > 0) { b.inv[k] -= lost; S.stats.spoiled += lost; }
      }
    }
    // worn paths fade when nobody walks them
    const fade = Math.pow(0.5, 1 / S.content.tuning.planner.wearHalfLifeSeconds), wear = w.wear;
    for (let i = 0; i < wear.length; i++) if (wear[i] > 0) wear[i] = wear[i] < 0.05 ? 0 : wear[i] * fade;
  }
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
