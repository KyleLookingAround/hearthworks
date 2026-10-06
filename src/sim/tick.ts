import { assignWorkers, makeAgent, nearestStore, updateAgent } from './agents.ts';
import { cold, homeTier, updateBuilding, foodsOf } from './production.ts';
import { formOf } from './planner/core.ts';
import { plan } from './planner.ts';
import { shortOfFood } from './planner/sense.ts';
import { updateKnowledge } from './knowledge.ts';
import { updateTrade } from './trade.ts';
import { feastMood, holdFeasts, missFeasts, newcomer, riteMood, updatePeople } from './people.ts';
import { updateSettling } from './settle.ts';
import { updateSea } from './sea.ts';
import { updateShips } from './ships.ts';
import { moveRaids, sickShare, updateHardship } from './hardship.ts';
import { bp, chronicle, door, emit, villagers } from './core.ts';
import { saplings, worn } from './terrain.ts';
import { seasonOf, storesOnTrack } from './seasons.ts';
import type { State } from './types.ts';
import { surroundings } from './surroundings.ts';
import { closeBoard, openBoard } from './logistics.ts';
import { runBelts } from './belts.ts';
import { dietLift } from './farms.ts';

/** The season before each: as one comes, the feasts of the one before that were not held are missed. */
const PREV: Record<string, string> = { spring: 'winter', summer: 'spring', autumn: 'summer', winter: 'autumn' };

/**
 * Mood per settlement: the share of its villagers living in a house with food on the shelf
 * (hungry houses count 0, empty shelves `empty_shelf_fed`). S.mood is the same over the whole world.
 */
export function computeMood(S: State) {
  const n = S.towns.length, pop = new Array(n).fill(0), fed = new Array(n).fill(0), around = new Array(n).fill(0), tier = new Array(n).fill(0), chill = new Array(n).fill(0), eats = new Array(n).fill(0);
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
    // a varied diet (farms that grow) lifts mood
    if (S.farms) eats[b.town] += r * dietLift(S, b);
    if (b.hunger > 0) continue;
    if (cold(S, b)) chill[b.town] += r;
    fed[b.town] += foodsOf(S, b).some(f => (b.inv[f] || 0) > 0) ? r : r * S.content.tuning.needs.emptyShelfFed;
  }
  const blend = (f: number, a: number) => f * (1 - wgt) + a * wgt;
  // hardship: the sick, and the laws (rationing, long hours and forbidding the hungry to leave weigh on mood; short hours lift it)
  const H = S.content.tuning.hardship;
  const hard = (t: (typeof S.towns)[number]) => (S.hardship ? H.sickMood * sickShare(S, t) : 0) + (t.laws.rationing ? H.rationMood : 0) + (t.laws.hours === 'long' ? H.longMood : t.laws.hours === 'short' ? -H.shortMood : 0) + (t.laws.leave ? 0 : H.stayMood);
  const hardTown = S.towns.map(hard);
  // a feast lately held lifts it, against the cold too
  S.towns.forEach((t, i) => { t.fed = pop[i] ? fed[i] / pop[i] : 1; t.mood = pop[i] ? Math.min(1, Math.max(0, Math.min(1, blend(t.fed, around[i] / pop[i]) + variety(tier[i], pop[i]) + eats[i] / pop[i] - hardTown[i]) - chilled(chill[i], pop[i]) - riteMood(S, t)) + feastMood(S, t)) : 1; });
  // each settlement's form follows its people, whether or not it plans for itself
  for (const t of S.towns) { const f = formOf(S, t); if (f !== t.form) { chronicle(S, t.id, 'form', `${t.name} became a ${f}`); t.form = f; } }
  const P = pop.reduce((s, k) => s + k, 0), F = fed.reduce((s, k) => s + k, 0), A = around.reduce((s, k) => s + k, 0);
  S.fed = P ? F / P : 1;
  const V = tier.reduce((s, k) => s + k, 0);
  const C = chill.reduce((s, k) => s + k, 0);
  // the dead waiting for their farewell weigh on their own settlement's share of the people
  const R = S.towns.reduce((s, t, i) => s + pop[i] * riteMood(S, t), 0), Hd = S.towns.reduce((s, t, i) => s + pop[i] * hardTown[i], 0);
  const E = eats.reduce((s, k) => s + k, 0), Fe = S.towns.reduce((s, t, i) => s + pop[i] * feastMood(S, t), 0);
  S.mood = P ? Math.min(1, Math.max(0, Math.min(1, blend(S.fed, A / P) + variety(V, P) + E / P - Hd / P) - chilled(C, P) - R / P) + Fe / P) : 1;
  S.stats.peakVillagers = Math.max(S.stats.peakVillagers, villagers(S).length);
}

/**
 * Every settlement happy enough to draw people, with a free bed, gets a newcomer: villages grow
 * side by side, so a world with more settlements grows faster.
 */
function migrate(S: State) {
  const freeBeds = (b: (typeof S.buildings)[number]) => { const B = bp(S, b); return B.homes && !b.site ? B.homes - b.residents.length : 0; };
  if (!S.newcomers) return;
  for (const t of S.towns) {
    if (t.mood < S.content.tuning.needs.migrateMinMood) continue;
    // with seasons on, nobody moves to a settlement whose homes go hungry: a lean winter is weathered before it takes anyone in
    if (S.seasons && t.fed < 1) continue;
    // nobody moves to a self-planning settlement whose bread falls short of what its people already need
    if (shortOfFood(S, t)) continue;
    // with seasons on, a newcomer comes in any season while the winter store is on track counting them: freely in
    // spring, from summer while the store keeps pace with the winter's meals, through the winter while what is left covers it
    if (!storesOnTrack(S, t, 1)) continue;
    const house = S.buildings.find(b => b.town === t.id && freeBeds(b) > 0);
    if (!house) continue;
    const from = nearestStore(S, house) ?? house, d = door(from);
    const a = makeAgent(S, 'villager', d.x + 0.5, d.y + 0.5);
    a.home = house; house.residents.push(a.id);
    if (S.people) newcomer(S, a, t);
    S.stats.arrivals++;
    emit(S, 'good', `A newcomer moved to ${t.name}`, true);
  }
}

/** Trees planted as saplings grow until they can be felled. */
function growTrees(S: State, dt: number) {
  const w = S.world, grow = S.content.tuning.map.treeGrowSeconds;
  const young = saplings(w);
  for (const i of young) {
    if (w.tree[i] !== 1) { young.delete(i); continue; }
    w.grow[i] += dt;
    if (w.grow[i] >= grow) { w.tree[i] = 2; young.delete(i); }
  }
}

/** As each season comes, say so, and the feasts of the one before that were not held are missed; between, feasts put off are tried again. */
function turnSeasons(S: State) {
  if (Math.floor(S.t) % Math.round(S.content.tuning.seasons.yearSeconds / 4) === 0 && Math.floor(S.t) > 0) {
    const s = seasonOf(S)!;
    emit(S, s === 'winter' ? 'bad' : 'info', s === 'winter' ? 'Winter has come: the fields rest and homes burn firewood' : `${s[0].toUpperCase()}${s.slice(1)} has come`);
    for (const t of S.towns) chronicle(S, t.id, 'season', `${s[0].toUpperCase()}${s.slice(1)} came to ${t.name} in year ${Math.floor(S.t / S.content.tuning.seasons.yearSeconds) + 1}`);
    missFeasts(S, PREV[s]);
    holdFeasts(S, s);
  } else if (S.people && Math.floor(S.t) % S.content.tuning.people.feastRetrySeconds === 0) holdFeasts(S, seasonOf(S)!, false);
}

/** Every `spoil_every_seconds`, food left out in stores that do not keep it spoils: the whole units of `spoils` of the pile. */
function spoil(S: State) {
  if (Math.floor(S.t) % S.content.tuning.production.spoilEverySeconds !== 0) return;
  for (const b of S.buildings) {
    const B = bp(S, b);
    if (!B.storage || b.site) continue;
    for (const k in b.inv) {
      const G = S.content.goods[k];
      if (!G?.spoils || B.keeps?.includes(k)) continue;
      const lost = Math.min(Math.floor((b.inv[k] - (b.reserved[k] || 0)) * G.spoils), b.inv[k] - (b.reserved[k] || 0));
      if (lost > 0) { b.inv[k] -= lost; S.stats.spoiled += lost; }
    }
  }
}

/** Worn paths fade when nobody walks them, and are gone under `wear_floor`. */
function fadePaths(S: State) {
  const P = S.content.tuning.planner, w = S.world, fade = Math.pow(0.5, 1 / P.wearHalfLifeSeconds), wear = w.wear, trodden = worn(w);
  for (const i of trodden) {
    if (wear[i] > 0) wear[i] = wear[i] < P.wearFloor ? 0 : wear[i] * fade;
    if (!(wear[i] > 0)) trodden.delete(i);
  }
}

/** Every migrant_every_seconds, settlements happy enough draw newcomers. */
function newcomers(S: State, dt: number) {
  S.migT += dt;
  if (S.migT >= S.content.tuning.needs.migrantEverySeconds) { S.migT = 0; migrate(S); }
}

/**
 * One system of the simulation. `every` is how often it runs: each step (dt), once a game second
 * (dt 1, as `S.secT` passes a whole second), or each step after the seconds' systems ('after').
 * `on` is the option it needs; a system whose option is off does not run. Systems keep their own
 * slower clocks inside (the planner's looks, visits, camps).
 */
export interface System { name: string; every: 'step' | 'second' | 'after'; on?: (S: State) => boolean; run: (S: State, dt: number) => void }

/**
 * The order of the world, which is part of the game: caches filled by whichever system asks first
 * within a tick, and every random stream, depend on it. Moving a row changes how games play out.
 */
export const SYSTEMS: System[] = [
  { name: 'trees', every: 'step', run: growTrees },
  { name: 'buildings', every: 'step', run: (S, dt) => { for (const b of [...S.buildings]) if (!b.dead) updateBuilding(S, b, dt); } },
  { name: 'job board opens', every: 'step', run: S => openBoard(S) },
  { name: 'belts', every: 'step', run: S => runBelts(S) },
  { name: 'agents', every: 'step', run: (S, dt) => { for (const a of [...S.agents]) if (!a.dead) updateAgent(S, a, dt); } },
  { name: 'job board closes', every: 'step', run: S => closeBoard(S) },
  { name: 'raids', every: 'step', on: S => S.hardship, run: moveRaids },
  { name: 'workers', every: 'second', run: S => assignWorkers(S) },
  { name: 'mood', every: 'second', run: S => computeMood(S) },
  { name: 'knowledge', every: 'second', run: updateKnowledge },
  { name: 'trade', every: 'second', on: S => S.trade, run: updateTrade },
  { name: 'people', every: 'second', on: S => S.people, run: updatePeople },
  { name: 'charts', every: 'second', on: S => S.charts, run: updateSea },
  { name: 'ships', every: 'second', on: S => S.ships, run: S => updateShips(S) },
  { name: 'settling', every: 'second', on: S => S.settlers, run: updateSettling },
  { name: 'hardship', every: 'second', on: S => S.hardship, run: updateHardship },
  { name: 'seasons', every: 'second', on: S => S.seasons, run: S => turnSeasons(S) },
  { name: 'spoiling', every: 'second', run: S => spoil(S) },
  { name: 'worn paths', every: 'second', run: S => fadePaths(S) },
  // after the world has moved, each settlement's planner looks, and newcomers come
  { name: 'planner', every: 'after', run: plan },
  { name: 'newcomers', every: 'after', run: newcomers },
];

const run = (S: State, every: System['every'], dt: number) => {
  for (const sys of SYSTEMS) if (sys.every === every && (!sys.on || sys.on(S))) sys.run(S, dt);
};

/** Advance the simulation by dt game seconds. Deterministic for a given seed and command sequence. */
export function tick(S: State, dt: number) {
  S.t += dt;
  run(S, 'step', dt);
  S.secT += dt;
  if (S.secT >= 1) { S.secT -= 1; run(S, 'second', 1); }
  run(S, 'after', dt);
}

export const STEP = 0.1;

/** Run whole fixed steps for `seconds` of game time. */
export function runFor(S: State, seconds: number, each?: (S: State) => void) {
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i++) { tick(S, STEP); each?.(S); }
}
