import { hash01, rand } from './rng.ts';
import { makeAgent, quit, removeAgent } from './agents.ts';
import { foodChainOf, foodsOf } from './production.ts';
import { shortOfFood } from './planner.ts';
import { add, bp, chronicle, door, emit, villagers } from './core.ts';
import { seasonOf } from './seasons.ts';
import type { Agent, Building, Custom, Feast, ItemId, Learning, Naming, State, Town } from './types.ts';

/**
 * People (Phase 14): villagers age, are born and die, learn their trades, and their settlements honour
 * the dead by their own custom. Everything random here draws from S.prng, so turning people on never
 * shifts the main simulation's stream of numbers. See design/systems/people.md.
 */
const P = (S: State) => S.content.tuning.people;

/**
 * A place of learning of this kind in a settlement: standing, or with `working` its worker at work.
 * A library keeps knowledge just by standing; a school, a university and a printing house need their teacher, scholar or printer.
 */
export function learningAt(S: State, town: number, kind: Learning, working = kind !== 'library'): boolean {
  return S.buildings.some(b => {
    if (b.town !== town || b.site || S.content.blueprints[b.type].learning !== kind) return false;
    if (!working) return true;
    const w = b.worker !== null ? S.amap.get(b.worker) : undefined;
    return !!w && w.state === 'working';
  });
}

/** Can this villager read: schooled as a child, or grown in a settlement whose printing house has its printer at work (books in every home)? */
export const reads = (S: State, a: Agent, printed = !!a.home && learningAt(S, a.home.town, 'press')) => a.role !== 'child' && (a.schooled || printed);

const lifespan = (S: State) => P(S).lifespanSeconds + rand(S.prng) * P(S).lifespanJitterSeconds;
export const ageOf = (S: State, a: Agent) => S.t - a.born;

/** A new world's people: its founders adults of many ages, its settlements each with a custom from their land. */
export function initPeople(S: State) {
  for (const a of villagers(S)) {
    a.born = -(P(S).adultSeconds + rand(S.prng) * (P(S).founderAgeMaxSeconds - P(S).adultSeconds));
    a.dies = lifespan(S);
  }
  const word = { burial: 'buries its dead', cremation: 'cremates its dead', ship: 'sets its dead out to sea' };
  for (const t of S.towns) { t.custom = customFor(S, t); chronicle(S, t.id, 'custom', `${t.name} ${word[t.custom]}`); }
  // and names its people as its land suggests: the founders too
  for (const t of S.towns) { t.naming = namingFor(S, t); chronicle(S, t.id, 'naming', `${t.name} names its children ${NAMING[t.naming]}`); }
  for (const a of villagers(S)) if (a.home) a.name = nameFor(S, a, S.towns[a.home.town]);
  // with the year turning, each keeps a feast its land suggests
  if (S.seasons) for (const t of S.towns) { t.feasts = [feastFor(S, t)]; chronicle(S, t.id, 'feast', `${t.name} keeps ${FEAST[t.feasts[0]].text}`); }
}

/** A newcomer is a young adult, who goes by a name of the settlement they come to. */
export function newcomer(S: State, a: Agent, town: Town) {
  a.born = S.t - P(S).adultSeconds - rand(S.prng) * P(S).adultSeconds;
  a.dies = lifespan(S);
  a.name = nameFor(S, a, town);
}

/** The naming customs: where a settlement takes its children's names from. */
export const NAMING: Record<Naming, string> = { sea: 'for the sea', trees: 'for the trees', fields: 'for the fields and their birds' };

/** The naming custom a settlement's land suggests, by the same lines as its custom for the dead: much water, the sea; well wooded, the trees; else the fields. */
export function namingFor(S: State, t: Town): Naming {
  if (!S.bmap.get(t.store)) return 'fields';
  const l = landOf(S, t);
  return l.water >= P(S).waterForShip ? 'sea' : l.wood >= P(S).woodForPyre ? 'trees' : 'fields';
}

/** A villager's given name: from their settlement's custom, picked by their id and the world's seed, never by a random stream. */
export const nameFor = (S: State, a: Agent, t: Town) => { const list = P(S).names[t.naming]; return list[Math.floor(hash01(a.id * 7919 + (S.seed >>> 0)) * list.length)]; };

/** A villager's name for the player: their given name, or a word for them before names (an older save's founders). */
export const called = (a: Agent) => a.name || 'a villager';

/** The land within `custom_radius` of a settlement's storage yard: its share of water, and of its land in grown trees. */
export function landOf(S: State, t: Town): { water: number; wood: number } {
  const store = S.bmap.get(t.store);
  if (!store) return { water: 0, wood: 0 };
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
  return { water: all ? water / all : 0, wood: land ? wood / land : 0 };
}

/** The custom a settlement's land suggests: one by much water sets its dead out to sea, a well-wooded one cremates, others bury. */
export function customFor(S: State, t: Town): Custom {
  if (!S.bmap.get(t.store)) return 'burial';
  const l = landOf(S, t);
  if (l.water >= P(S).waterForShip) return 'ship';
  if (l.wood >= P(S).woodForPyre) return 'cremation';
  return 'burial';
}

/**
 * The feasts (with people and seasons on): each is held as its season comes, if the stores hold what it needs,
 * and lifts the settlement's mood by `feast_mood` for `feast_seconds`.
 */
export const FEAST: Record<Feast, { name: string; text: string; season: string; item: ItemId; per: (S: State) => number }> = {
  harvest: { name: 'Harvest Festival', text: 'a harvest festival as autumn comes', season: 'autumn', item: 'bread', per: S => P(S).harvestBread },
  midwinter: { name: 'Midwinter Fire', text: 'a midwinter fire as winter comes', season: 'winter', item: 'logs', per: S => P(S).fireLogs },
};

/** The feast a settlement's land suggests: a well-wooded one lights a midwinter fire, others hold a harvest festival. */
export function feastFor(S: State, t: Town): Feast {
  return landOf(S, t).wood >= P(S).woodForFire ? 'midwinter' : 'harvest';
}

/** When this season began, in game seconds. */
const seasonStart = (S: State) => { const q = S.content.tuning.seasons.yearSeconds / 4; return Math.floor(S.t / q + 1e-9) * q; };

/** Has a settlement held a feast since this season began? (A season has one feast of its own, so this is that feast.) */
const heldThisSeason = (S: State, t: Town) => t.feastUntil - P(S).feastSeconds >= seasonStart(S) - 1e-6;

/**
 * What a settlement lays in of a good for its feasts (`feast_lay_in` of what each needs, for everyone housed): in the
 * season before a feast, and in its own season until it is held, so the bakeries bake for the festival in summer
 * rather than find the yards bare as autumn comes.
 */
export function feastStock(S: State, t: Town, g: ItemId, pop: number): number {
  if (!S.people || !S.seasons || !t.feasts?.length || !P(S).feastLayIn) return 0;
  const s = seasonOf(S);
  if (!s) return 0;
  let n = 0;
  for (const f of t.feasts) {
    const F = FEAST[f];
    if (F.item === g && (F.season === NEXT[s] || (F.season === s && !heldThisSeason(S, t)))) n += Math.ceil(pop * F.per(S) * P(S).feastLayIn);
  }
  return n;
}
const NEXT: Record<string, string> = { spring: 'summer', summer: 'autumn', autumn: 'winter', winter: 'spring' };

/**
 * Through a feast's season: every settlement holds its feast of that season as soon as its stores hold what it needs,
 * as the season comes if they can (`first` says the season has just come: a feast put off is said so once). A feast
 * not held by the season's end is missed (`missFeasts`).
 */
export function holdFeasts(S: State, season: string, first = true) {
  if (!S.people || !S.seasons) return;
  for (const t of S.towns) for (const f of t.feasts) {
    const F = FEAST[f];
    if (F.season !== season || heldThisSeason(S, t)) continue;
    const yards = S.buildings.filter(b => b.town === t.id && !b.site && bp(S, b).storage);
    const pop = villagers(S).filter(a => a.home?.town === t.id).length;
    if (!yards.length || !pop) continue;
    const need = Math.ceil(pop * F.per(S));
    const spare = (b: Building) => Math.max(0, Math.floor((b.inv[F.item] || 0) - (b.reserved[F.item] || 0)));
    if (yards.reduce((n, b) => n + spare(b), 0) < need) {
      if (first) chronicle(S, t.id, 'feast', `${t.name} put off its ${F.name}: not enough ${S.content.goods[F.item]?.name.toLowerCase() ?? F.item} in store yet`);
      continue;
    }
    let left = need;
    for (const b of yards) { const k = Math.min(left, spare(b)); if (k > 0) { add(b.inv, F.item, -k); left -= k; } if (!left) break; }
    t.feastUntil = S.t + P(S).feastSeconds;
    S.stats.feasts++;
    chronicle(S, t.id, 'feast', `${t.name} held its ${F.name}`);
    emit(S, 'good', `${t.name} held its ${F.name}`);
  }
}

/** As a season ends (called as the next comes, before its feasts): each feast of the season gone by that was not held is missed. */
export function missFeasts(S: State, season: string) {
  if (!S.people || !S.seasons) return;
  const q = S.content.tuning.seasons.yearSeconds / 4, from = seasonStart(S) - q;
  for (const t of S.towns) for (const f of t.feasts) {
    const F = FEAST[f];
    if (F.season !== season || t.feastUntil - P(S).feastSeconds >= from - 1e-6) continue;
    S.stats.feastsMissed++;
    chronicle(S, t.id, 'feast', `${t.name} could not hold its ${F.name} this year: not enough ${S.content.goods[F.item]?.name.toLowerCase() ?? F.item} in store`);
  }
}

/** How much a feast lately held lifts a settlement's mood. */
export const feastMood = (S: State, t: Town) => (S.people && S.seasons && S.t < t.feastUntil ? P(S).feastMood : 0);

/** A visitor home from a neighbour that keeps a feast their own settlement does not may bring it home (`feast_spread`). */
export function bringFeast(S: State, home: Town, host: Town) {
  if (!S.people || !S.seasons) return;
  for (const f of host.feasts) {
    if (home.feasts.includes(f) || rand(S.prng) >= P(S).feastSpread) continue;
    home.feasts.push(f);
    chronicle(S, home.id, 'feast', `${home.name} took up ${host.name}'s ${FEAST[f].name}, held as ${FEAST[f].season} comes`);
    emit(S, 'info', `${home.name} took up the ${FEAST[f].name} from ${host.name}`);
  }
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
  const T = P(S), shelves = new Map<number, boolean>();
  const shelved = (town: number) => { let v = shelves.get(town); if (v === undefined) shelves.set(town, v = learningAt(S, town, 'library', false)); return v; };
  const presses = new Map<number, boolean>();
  const printed = (town: number) => { let v = presses.get(town); if (v === undefined) presses.set(town, v = learningAt(S, town, 'press')); return v; };
  for (const a of villagers(S)) {
    const age = ageOf(S, a);
    if (a.dies && age >= a.dies) { die(S, a); continue; }
    if (a.role === 'child' && age >= T.adultSeconds) {
      a.role = 'carrier'; a.state = 'idle';
      // a child of a settlement with a school at work grows up schooled
      if (a.home && learningAt(S, a.home.town, 'school')) a.schooled = true;
    }
    // the old retire from their workplace, and lend a hand carrying
    else if (a.role === 'worker' && age >= T.elderSeconds && a.work) quit(a);
    // practice: a worker at work learns the trade, faster with a master in the settlement, or,
    // for one who can read (schooled, or with books from a printing house), from the trade written down in its library once someone somewhere has proven it in use
    if (a.role === 'worker' && a.work && a.state === 'working') {
      const k = a.work.type, s = a.skill[k] || 0, town = a.home ? S.towns[a.home.town] : undefined;
      const master = !!town && (hasExpert(S, town.id, k, a) || (reads(S, a, printed(town.id)) && !!town.knows[k]?.verified.length && shelved(town.id)));
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
  emit(S, 'info', `${a.name ? `${a.name}, an elder of ${town.name},` : `An elder of ${town.name}`} died, old and content; they wait ${how}`, true);
}

/** A fed home with two adults has a child now and then, while its settlement has a bed for one and its food is not short. */
function births(S: State, dt: number) {
  const T = P(S), chain = foodChainOf(S);
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
      c.name = nameFor(S, c, town);
      if (!S.chronicle.some(c => c.town === town.id && c.kind === 'birth')) chronicle(S, town.id, 'birth', `The first child, ${c.name}, was born in ${town.name}`);
      emit(S, 'good', `${c.name} was born in ${town.name}`, true);
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
    const word = { burial: 'bury its dead', cremation: 'cremate its dead', ship: 'set its dead out to sea' };
    chronicle(S, t.id, 'custom', `${t.name} could no longer ${word[was]}, and took to ${next}`);
    for (const o of S.towns) if (o !== t) chronicle(S, o.id, 'custom', `${o.name} heard that ${t.name} now takes to ${next}`);
    emit(S, 'bad', `${t.name} could not ${word[was]} and took to ${next}`);
  }
}
