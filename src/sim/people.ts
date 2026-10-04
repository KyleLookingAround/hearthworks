import { rand } from './rng.ts';
import { makeAgent, release, removeAgent } from './agents.ts';
import { shortOfFood } from './planner.ts';
import { add, bp, chronicle, door, emit, foodsOf, learningAt, villagers } from './world.ts';
import type { Agent, Building, Custom, State, Town } from './types.ts';

/**
 * People (Phase 14): villagers age, are born and die, learn their trades, and their settlements honour
 * the dead by their own custom. Everything random here draws from S.prng, so turning people on never
 * shifts the main simulation's stream of numbers. See design/systems/people.md.
 */
const P = (S: State) => S.content.tuning.people;

const lifespan = (S: State) => P(S).lifespanSeconds + rand(S.prng) * P(S).lifespanJitterSeconds;
export const ageOf = (S: State, a: Agent) => S.t - a.born;

/** A new world's people: its founders adults of many ages, its settlements each with a custom from their land. */
export function initPeople(S: State) {
  for (const a of villagers(S)) {
    a.born = -(P(S).adultSeconds + rand(S.prng) * (P(S).founderAgeMaxSeconds - P(S).adultSeconds));
    a.dies = lifespan(S);
  }
  const word = { burial: 'buries', cremation: 'cremates', ship: 'sets out to sea' };
  for (const t of S.towns) { t.custom = customFor(S, t); chronicle(S, t.id, 'custom', `${t.name} ${word[t.custom]} its dead`); }
}

/** A newcomer is a young adult. */
export function newcomer(S: State, a: Agent) {
  a.born = S.t - P(S).adultSeconds - rand(S.prng) * P(S).adultSeconds;
  a.dies = lifespan(S);
}

/** The custom a settlement's land suggests: one by much water sets its dead out to sea, a well-wooded one cremates, others bury. */
export function customFor(S: State, t: Town): Custom {
  const store = S.bmap.get(t.store);
  if (!store) return 'burial';
  const W = S.world, r = P(S).customRadius, cx = store.x + store.w / 2, cy = store.y + store.h / 2;
  let all = 0, land = 0, water = 0, wood = 0;
  for (let y = Math.max(0, Math.floor(cy - r)); y <= Math.min(W.h - 1, Math.ceil(cy + r)); y++) for (let x = Math.max(0, Math.floor(cx - r)); x <= Math.min(W.w - 1, Math.ceil(cx + r)); x++) {
    if (Math.hypot(x + 0.5 - cx, y + 0.5 - cy) > r) continue;
    const i = y * W.w + x;
    all++;
    if (!W.ground[i]) { water++; continue; }
    land++;
    if (W.tree[i] === 2) wood++;
  }
  if (all && water / all >= P(S).waterForShip) return 'ship';
  if (land && wood / land >= P(S).woodForPyre) return 'cremation';
  return 'burial';
}

/** How much the dead waiting past `rite_grace_seconds` weigh on a settlement's mood. */
export function riteMood(S: State, t: Town): number {
  if (!S.people || !t.rites.length) return 0;
  return S.t - t.rites[0] > P(S).riteGraceSeconds ? P(S).ritePenalty : 0;
}

/** Workplace pace from its worker's skill: a novice at 1 - speedup/2, an expert up to 1 + speedup/2. */
export function skillPace(S: State, w: Agent | undefined, b: Building): number {
  if (!S.people || !w) return 1;
  return 1 - P(S).skillSpeedup / 2 + P(S).skillSpeedup * (w.skill[b.type] || 0);
}

/** An expert of a trade lives in a settlement. */
export const hasExpert = (S: State, town: number, type: string, but?: Agent) => villagers(S).some(a => a !== but && a.home?.town === town && (a.skill[type] || 0) >= P(S).expertAt);

/** Once a second: growing up, retiring, dying, births, practice, and farewells. */
export function updatePeople(S: State, dt: number) {
  const T = P(S);
  for (const a of villagers(S)) {
    const age = ageOf(S, a);
    if (a.dies && age >= a.dies) { die(S, a); continue; }
    if (a.role === 'child' && age >= T.adultSeconds) {
      a.role = 'carrier'; a.state = 'idle';
      // a child of a settlement with a school at work grows up schooled
      if (a.home && learningAt(S, a.home.town, 'school')) a.schooled = true;
    }
    // the old retire from their workplace, and lend a hand carrying
    else if (a.role === 'worker' && age >= T.elderSeconds && a.work) release(S, a.work);
    // practice: a worker at work learns the trade, faster with a master in the settlement
    if (a.role === 'worker' && a.work && a.state === 'working') {
      const k = a.work.type, s = a.skill[k] || 0, master = a.home ? hasExpert(S, a.home.town, k, a) : false;
      const K = S.content.tuning.knowledge;
      a.skill[k] = Math.min(1, s + (1 - s) * (dt / T.practiceSeconds) * (master ? T.apprenticeFactor : 1) * (a.schooled ? K.schoolFactor : 1));
    }
  }
  births(S, dt);
  for (const t of S.towns) farewells(S, t);
}

function die(S: State, a: Agent) {
  const town = a.home ? S.towns[a.home.town] : undefined;
  removeAgent(S, a);
  S.stats.deaths++;
  if (!town) return;
  town.rites.push(S.t);
  const how = { burial: 'to be laid to rest', cremation: 'for the pyre', ship: 'to be set out to sea' }[town.custom];
  emit(S, 'info', `An elder of ${town.name} died, old and content; they wait ${how}`, true);
}

/** What homes eat and everything that goes into making it. */
function foodChain(S: State): Set<string> {
  const out = new Set(Object.values(S.content.blueprints).filter(B => B.homes).flatMap(B => Object.keys(B.keepStocked)));
  for (let grew = true; grew;) {
    grew = false;
    for (const B of Object.values(S.content.blueprints)) if (Object.keys(B.output).some(g => out.has(g))) for (const i in B.input) if (!out.has(i)) { out.add(i); grew = true; }
  }
  return out;
}

/** A fed home with two adults has a child now and then, while its settlement has a bed for one and its food is not short. */
function births(S: State, dt: number) {
  const T = P(S), chain = foodChain(S);
  // a settlement badly short of anything in its food chain, with anyone hungry, or short of food (see shortOfFood),
  // has no children for now
  const easy = S.towns.map(t => t.fed >= 1 && !shortOfFood(S, t) && !Object.keys(t.planner.wants).some(g => chain.has(g) && t.planner.wants[g] >= 0.5));
  for (const b of S.buildings) {
    const B = bp(S, b);
    if (!B.homes || b.site || !easy[b.town] || b.hunger > 0 || !foodsOf(S, b).some(f => (b.inv[f] || 0) > 0)) continue;
    const adults = b.residents.filter(id => { const a = S.amap.get(id); return a && a.role !== 'child' && ageOf(S, a) < T.elderSeconds; }).length;
    if (adults < 2 || rand(S.prng) >= dt / T.birthEverySeconds) continue;
    const bed = B.homes > b.residents.length ? b : S.buildings.find(h => h.town === b.town && !h.site && (bp(S, h).homes ?? 0) > h.residents.length);
    if (!bed) continue;
    const d = door(bed), c = makeAgent(S, 'villager', d.x + 0.5, d.y + 0.5);
    c.born = S.t; c.dies = T.lifespanSeconds + rand(S.prng) * T.lifespanJitterSeconds; c.role = 'child';
    c.home = bed; bed.residents.push(c.id);
    S.stats.births++;
    const town = S.towns[bed.town];
    if (town) {
      if (!S.chronicle.some(c => c.town === town.id && c.kind === 'birth')) chronicle(S, town.id, 'birth', `The first child was born in ${town.name}`);
      emit(S, 'good', `A child was born in ${town.name}`, true);
    }
  }
}

/** The custom's place for one more farewell, if there is one with what it needs. */
function venue(S: State, t: Town): Building | null {
  for (const b of S.buildings) {
    const B = bp(S, b);
    if (b.town !== t.id || b.site || B.rite !== t.custom) continue;
    if (t.custom === 'burial' && (t.graves[b.id] || 0) < B.graves) return b;
    if (t.custom === 'cremation' && (b.inv.logs || 0) >= P(S).pyreLogs) return b;
    if (t.custom === 'ship' && (b.inv.planks || 0) >= P(S).shipPlanks) return b;
  }
  return null;
}

/** Does a settlement have the custom's place at all (stocked or not, a graveyard with room)? */
export function hasPlace(S: State, t: Town, orSite = true): boolean {
  return S.buildings.some(b => {
    const B = bp(S, b);
    return b.town === t.id && B.rite === t.custom && (orSite || !b.site) && (t.custom !== 'burial' || b.site || (t.graves[b.id] || 0) < B.graves);
  });
}

/** Honour the waiting dead where the custom allows; a custom that cannot be kept for long gives way to another. */
function farewells(S: State, t: Town) {
  while (t.rites.length) {
    const v = venue(S, t);
    if (!v) break;
    if (t.custom === 'burial') t.graves[v.id] = (t.graves[v.id] || 0) + 1;
    else if (t.custom === 'cremation') add(v.inv, 'logs', -P(S).pyreLogs);
    else add(v.inv, 'planks', -P(S).shipPlanks);
    const waited = S.t - t.rites.shift()!;
    S.stats.honoured++;
    S.stats.riteWaitMax = Math.max(S.stats.riteWaitMax, waited);
  }
  // a custom gives way only when it has had no place at all (not even one being built) for the whole wait
  if (t.rites.length && S.t - t.rites[0] > P(S).changeCustomAfterSeconds && !hasPlace(S, t, true)) {
    const was = t.custom, next: Custom = was === 'burial' ? 'cremation' : 'burial';
    t.custom = next;
    // the strain starts over under the new custom
    t.rites = t.rites.map(() => S.t - P(S).riteGraceSeconds);
    const word = { burial: 'bury', cremation: 'cremate', ship: 'set out to sea' };
    chronicle(S, t.id, 'custom', `${t.name} could no longer ${word[was]} its dead, and took to ${next}`);
    for (const o of S.towns) if (o !== t) chronicle(S, o.id, 'custom', `${o.name} heard that ${t.name} now takes to ${next}`);
    emit(S, 'bad', `${t.name} could not ${word[was]} its dead and took to ${next}`);
  }
}
