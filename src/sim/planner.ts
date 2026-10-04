/**
 * The village planner. Every `interval_seconds` it looks at the town, finds
 * the worst shortage, picks the blueprint that relieves it best for its cost,
 * chooses a site and posts it to the job board like any other building.
 *
 * Nothing here names a building type: what a blueprint relieves is read from
 * its recipe, homes and harvest fields, so new blueprints in design/ join in.
 * Deterministic: no randomness at all, ties break by scan order.
 */
import { findPath, reachable } from './path.ts';
import { cancelTask, supplyOf, touches } from './logistics.ts';
import { fits } from './place.ts';
import { inNuisance } from './surroundings.ts';
import { NEED_TEXT, pressure } from './knowledge.ts';
import { add, beside, bp, chronicle, ctr, demolish, dims, door, emit, FACING, front as frontOf, lift, nearestTown, placeBridge, placeBuilding, seasonOf, storesOnTrack, villagers } from './world.ts';
import { hasPlace } from './people.ts';
import { reserve } from './agents.ts';
import { enoughInStore, foodChainOf, plentyInStore } from './production.ts';
import { atRisk, guarded, struckLately, unguarded } from './hardship.ts';
import { planRoads } from './roads.ts';
import { crew, growFarm, maxSize, places, sizeName, toGrow, unripe } from './farms.ts';
import { HAZARDS, ZONES, type BlueprintDef, type Hazard, type Building, type Form, type ItemId, type PlannerState, type State, type Stock, type Town, type World } from './types.ts';

export const plannerOn = (on: boolean): PlannerState => ({ on, t: 0, settle: 0, streak: { type: '', n: 0 }, site: null, want: null, saving: null, status: on ? 'Looking around the village' : 'Village plans are off', placed: 0, noRoom: {}, roads: true, replanAt: 0, firstFor: {}, wants: {}, use: {} });

interface Shortage { key: string; sev: number; why: string; guard?: Hazard; good?: ItemId; homes?: boolean; hauling?: boolean; crossing?: boolean; detours?: boolean; store?: boolean; rite?: boolean; carts?: boolean; oxen?: boolean; learn?: 'library' | 'school' | 'university'; /** traded for from this neighbour rather than made */ from?: Town }
interface Choice { B: BlueprintDef; sev: number; why: string; wait?: string; key?: string }
interface Look { storeNeed: number; storeRoom: number; town: Town; pop: number; freeBeds: number; spareHands: number; coming: boolean; foodShort: boolean; movable: boolean; uncovered: number; hasDock: boolean; supply: Stock; demand: Stock; shortages: Shortage[] }

const goodName = (S: State, g: ItemId) => S.content.goods[g]?.name.toLowerCase() ?? g;
const runningLow = (S: State, g: ItemId) => { const n = goodName(S, g); return `${n} ${n.endsWith('s') ? 'are' : 'is'} running low`; };
const article = (name: string) => (/^[aeiou]/i.test(name) ? 'an' : 'a');
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const T = (S: State) => S.content.tuning.planner;
/** The blueprints this settlement knows, in build-bar order. */
const known = (S: State, town: Town) => Object.values(S.content.blueprints).filter(B => B.id in town.knows).sort((a, b) => a.order - b.order);
const mineOf = (S: State, town: Town) => S.buildings.filter(b => b.town === town.id);
/** Is a point within reach of a courier building's bots? */
const covered = (S: State, p: { x: number; y: number }) => S.buildings.some(d => { const C = bp(S, d).couriers; return !!C && Math.hypot(p.x - ctr(d).x, p.y - ctr(d).y) <= C.radius; });

/** Grown trees within `r` of a point, those already in another harvester's range counted at `shared` weight. */
function treeScore(S: State, cx: number, cy: number, r: number, others: Building[], shared: number): number {
  const W = S.world;
  let n = 0;
  for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) {
    if (x < 0 || y < 0 || x >= W.w || y >= W.h || W.tree[y * W.w + x] !== 2) continue;
    if (Math.hypot(x + 0.5 - cx, y + 0.5 - cy) > r) continue;
    const taken = others.some(o => { const c = ctr(o), R = bp(S, o).harvest!.radius; return Math.hypot(x + 0.5 - c.x, y + 0.5 - c.y) <= R; });
    n += taken ? shared : 1;
  }
  return n;
}

/**
 * How much of its nominal rate a producer can deliver on its own trees. Inputs are
 * handled by the chain pass; a missing worker is a labour shortage, not a lack of
 * capacity, so an unstaffed building still counts.
 */
function ownEffect(S: State, b: Building): number {
  const B = bp(S, b);
  if (!b.site && b.paused) return 0;
  if (B.harvest) {
    const c = ctr(b), harvesters = S.buildings.filter(o => o !== b && bp(S, o).harvest);
    return clamp01(treeScore(S, c.x, c.y, B.harvest.radius, harvesters, 0.5) / T(S).minTrees);
  }
  return 1;
}

/** Sense: one settlement's production and consumption rates per good, beds, hands and hauling, each shortage scored 0 to 1. */
export function look(S: State, town: Town = S.towns[0]): Look {
  const P = T(S), needs = S.content.tuning.needs;
  const supply: Stock = {}, demand: Stock = {};
  const mine = mineOf(S, town);
  const producers = mine.filter(b => { const B = bp(S, b); return B.seconds > 0 && Object.keys(B.output).length > 0; });
  const own = new Map(producers.map(b => [b, ownEffect(S, b)]));
  // (a grown workplace works as many cycles at once as it has places for hands)
  for (const b of producers) { const B = bp(S, b); for (const i in B.input) demand[i] = (demand[i] || 0) + (B.input[i] / B.seconds) * places(S, b); }
  // chain pass: a producer short of inputs delivers only the share its inputs allow
  let eff = new Map(own);
  for (let pass = 0; pass < 3; pass++) {
    for (const k in supply) supply[k] = 0;
    for (const b of producers) { const B = bp(S, b); for (const o in B.output) supply[o] = (supply[o] || 0) + (B.output[o] / B.seconds) * eff.get(b)! * places(S, b); }
    const next = new Map<Building, number>();
    for (const b of producers) {
      const B = bp(S, b);
      let e = own.get(b)!;
      for (const i in B.input) e = Math.min(e, demand[i] ? clamp01((supply[i] || 0) / demand[i]) : 1);
      next.set(b, e);
    }
    eff = next;
  }
  // a steady import relieves a shortage as a producer would: a village that trades for bricks needs no kiln
  if (S.trade) for (const g in town.trade.imports) supply[g] = (supply[g] || 0) + town.trade.imports[g];
  // and a neighbour's want of a good it makes none of is demand here, if this settlement knows how to make it
  if (S.trade) {
    const makes = new Set(known(S, town).filter(B => B.seconds).flatMap(B => Object.keys(B.output)));
    for (const o of S.towns) {
      if (o === town) continue;
      const theirs = new Set(S.buildings.filter(b => b.town === o.id && !b.site).flatMap(b => Object.keys(bp(S, b).output)));
      // a neighbour's want of a good it makes none of: `export_demand` a second for each unit of its severity, or,
      // from a neighbour trading for it with this settlement, at least what its porters carry away
      for (const g in o.planner.wants) if (makes.has(g) && !theirs.has(g)) demand[g] = (demand[g] || 0) + Math.max(o.planner.wants[g] * S.content.tuning.trade.exportDemand, g in o.trade.waits ? o.trade.imports[g] || 0 : 0);
    }
  }

  const people = villagers(S).filter(a => a.home?.town === town.id), pop = people.length;
  let freeBeds = 0, food: ItemId | null = null;
  for (const b of mine) {
    const B = bp(S, b);
    // beds on the way count, but not on a site starved of a good nobody has
    if (!B.homes || starved(S, b, town)) continue;
    freeBeds += B.homes - b.residents.length;
    food ??= Object.keys(B.keepStocked)[0] ?? null;
  }

  const shortages: Shortage[] = [];
  const F = S.content.tuning.farms, diet = new Set(S.farms ? F.diet : []);
  if (food) {
    // feed everyone here plus everyone the free beds will bring
    const meals = ((pop + freeBeds) / needs.eatEverySeconds) * P.foodHeadroom;
    if (S.farms) {
      // with farms that grow: `diet_share` of the meals from the foods of the diet, an equal part each, and bread for
      // the rest and for whatever part of the diet is not grown
      const part = (meals * F.dietShare) / F.diet.length;
      let bread = meals * (1 - F.dietShare);
      for (const g of F.diet) { demand[g] = (demand[g] || 0) + part; bread += Math.max(0, part - (supply[g] || 0)); }
      demand[food] = (demand[food] || 0) + bread;
    } else demand[food] = (demand[food] || 0) + meals;
  }
  // planks build everything: want a steady flow that grows with the town (other materials are made when saved for)
  for (const g of P.buildGoods) demand[g] = (demand[g] || 0) + (pop * P.planksPerVillagerMinute) / 60;
  // seasons: plan for winter all year: crops grow three seasons of four, firewood burns at the winter rate
  if (S.seasons) {
    // (fresh foods of the diet are eaten in season, not stored for the winter)
    const crops = new Set(Object.values(S.content.blueprints).filter(B => B.seasonal).flatMap(B => Object.keys(B.output)).filter(g => !diet.has(g)));
    for (const g of crops) if (demand[g]) demand[g] *= (4 / 3) * S.content.tuning.seasons.winterHeadroom;
    demand.logs = (demand.logs || 0) + pop / S.content.tuning.seasons.firewoodEverySeconds;
    // the gap: what the winter will eat, less the food already in store, over the time left before the frost
    const Z = S.content.tuning.seasons, phase = (S.t % Z.yearSeconds) / Z.yearSeconds;
    if (phase < 0.75) {
      let stored = 0;
      for (const b of mine) if (bp(S, b).storage && !b.site) for (const g of ['wheat', 'bread', ...Z.preserved]) stored += b.inv[g] || 0;
      const winter = (pop * Z.yearSeconds / 4 / needs.eatEverySeconds) * Z.winterHeadroom, left = (0.75 - phase) * Z.yearSeconds;
      if (winter > stored) demand.wheat = (demand.wheat || 0) + (winter - stored) / Math.max(60, left);
    }
  }
  // comforts by form: fish and cloth from a village, tools in a town; every comfort is wanted, for variety
  const comfort = new Set<ItemId>();
  const form = formOf(S, town);
  if (form !== 'hamlet') for (const g of needs.tierTwo) { comfort.add(g); demand[g] = (demand[g] || 0) + pop / needs.extrasEverySeconds; }
  if (form === 'town') for (const g of needs.tierThree) { comfort.add(g); demand[g] = (demand[g] || 0) + pop / needs.extrasEverySeconds; }
  // tools wear out where they are used: a speed-up a village reaches for, like a comfort
  if (form !== 'hamlet') for (const b of mine) { const B = bp(S, b); if (B.tools && !b.site && B.seconds) { comfort.add('tools'); demand.tools = (demand.tools || 0) + B.tools.speedup / (B.seconds * B.tools.wearCycles); } }

  const goods = Object.values(S.content.goods).sort((a, b) => (a.id === food ? -1 : b.id === food ? 1 : a.order - b.order));
  // comforts wait while bread is short: food first. Short means less than everyone's bare need (the headroom is for planning
  // bakeries, not for holding back everything else: a growing town always plans a little more bread than it eats)
  // With seasons, a winter store fallen behind is food short too.
  const foodShort = food ? (supply[food] || 0) < (demand[food] || 0) / P.foodHeadroom || town.fed < 1 || !storesOnTrack(S, town) : false;
  // and so does every other good outside the basics (food, building materials, firewood): iron ore for a smithy waits too
  const basic = basics(S);
  for (const g of goods) {
    const d = demand[g.id] || 0;
    if (d <= 0) continue;
    // a good the stores hold plenty of is not short, whatever the rates
    const sev = plentyInStore(S, town, g.id, d) ? 0 : clamp01(1 - (supply[g.id] || 0) / d) * (comfort.has(g.id) ? (foodShort ? 0 : P.comfortWeight) : foodShort && !basic.has(g.id) ? 0 : 1) * (diet.has(g.id) ? F.dietWeight : 1);
    shortages.push({ key: g.id, good: g.id, sev, why: comfort.has(g.id) ? `homes want ${goodName(S, g.id)}` : diet.has(g.id) ? `homes would eat ${goodName(S, g.id)} with their bread` : runningLow(S, g.id) });
  }
  // specialisation: what a neighbour makes and this settlement does not, it trades for
  for (const sh of shortages) if (sh.sev >= P.minSeverity) sh.from = importFrom(S, town, sh.good!, demand[sh.good!] || 0) ?? undefined;
  // hauling: carriers run off their feet; machines that haul relieve it where they reach.
  // Listed before beds so that, at full strain, it wins a tie with growth.
  const stops = mine.filter(b => !b.site);
  const uncovered = stops.length ? stops.filter(b => !covered(S, ctr(b))).length / stops.length : 0;
  shortages.push({ key: 'hauling', hauling: true, sev: clamp01(pressure(S, town, 'hauling') * P.haulWeight), why: NEED_TEXT.hauling });
  // crossing: the neighbours are across water; a dock relieves it
  const hasDock = mine.some(b => bp(S, b).shore);
  shortages.push({ key: 'crossing', crossing: true, sev: clamp01(pressure(S, town, 'crossing') * P.crossingWeight), why: NEED_TEXT.crossing });
  // detours: water keeps the village from land nearby, or sends trips the long way round; a bridge relieves it
  shortages.push({ key: 'detours', detours: true, sev: clamp01(pressure(S, town, 'detours') * P.detourWeight), why: NEED_TEXT.detours });
  // labour: villagers free to take a new job, keeping a share of the town hauling
  const carriers = people.filter(a => a.role === 'carrier' && a.state !== 'visit').length;
  // a workplace resting (fields in winter, or with enough in store) needs nobody now, and its worker is a spare hand
  // (counted by places for hands: a grown farm has more than one)
  const winter = seasonOf(S) === 'winter', rests = (b: Building) => !b.site && ((winter && !!bp(S, b).seasonal) || unripe(S, b) || enoughInStore(S, b));
  const open = (b: Building) => places(S, b) - crew(b).length;
  const openJobs = mine.reduce((n, b) => n + (bp(S, b).workers && !rests(b) ? open(b) : 0), 0);
  const resting = mine.reduce((n, b) => n + (bp(S, b).workers && rests(b) ? crew(b).length : 0), 0);
  const spareHands = carriers - reserve(S, town.id) - openJobs + resting;
  const idleJobs = mine.reduce((n, b) => n + (!b.site && bp(S, b).workers && !rests(b) ? open(b) : 0), 0);
  // newcomers would come to a settlement in good heart, given beds, in spring and summer (in summer while its winter store keeps pace)
  const s = seasonOf(S);
  // (and not while its bread falls short of what its people already eat: see shortOfFood)
  // (with farms that grow, the foods of the diet feed newcomers as bread does)
  const meals = (food ? supply[food] || 0 : 0) + [...diet].reduce((n, g) => n + (supply[g] || 0), 0);
  const coming = S.newcomers && (!food || !S.seasons || meals >= ((pop + 1) / needs.eatEverySeconds) * P.newcomerFoodShare) && town.mood >= needs.migrateMinMood && s !== 'autumn' && s !== 'winter' && (s !== 'summer' || storesOnTrack(S, town, 1));
  // a hand that can be moved to the food chain: a carrier beyond the last, or a worker outside the chain
  const chain = foodChainOf(S);
  const movable = carriers > 1 || mine.some(b => b.worker !== null && !Object.keys(bp(S, b).output).some(g => chain.has(g)));
  if (idleJobs > freeBeds && !foodShort) shortages.push({ key: 'beds', homes: true, sev: 1, why: idleJobs > 1 ? `${idleJobs} workplaces have nobody to staff them` : 'a workplace has nobody to staff it' });
  else {
    // don't invite newcomers the village can't feed yet
    const fed = foodShort ? 0 : 1;
    // no newcomers come in autumn or winter: homes for them wait for spring
    const growing = (town.mood >= needs.migrateMinMood ? 1 : 0.5) * (S.seasons && (seasonOf(S) === 'autumn' || seasonOf(S) === 'winter') ? 0 : 1);
    shortages.push({ key: 'beds', homes: true, sev: clamp01((P.growthBeds - freeBeds) / P.growthBeds) * growing * fed * P.growthWeight, why: 'no free beds for newcomers' });
  }
  // full stores: past `store_full_share` of their room, workshops stall with nowhere to put their goods
  {
    let held = 0, room = 0;
    for (const b of mine) { const B = bp(S, b); if (!B.storage || b.site || !B.capacity || B.keeps) continue; room += B.capacity; for (const k in b.inv) held += b.inv[k]; }
    const full = room ? held / room : 0;
    if (full >= P.storeFullShare) shortages.push({ key: 'storage', store: true, sev: clamp01((full - P.storeFullShare) / (1 - P.storeFullShare)), why: 'the stores are full' });
  }
  // winter stores: from summer, room enough for the winter's grain (a quarter year of meals, with headroom)
  let storeNeed = 0, storeRoom = 0;
  const season = seasonOf(S);
  if (S.seasons && (season === 'summer' || season === 'autumn')) {
    const Z = S.content.tuning.seasons;
    storeNeed = (pop * Z.yearSeconds / 4 / needs.eatEverySeconds) * Z.winterHeadroom;
    // a store's room for food is what other goods (planks, logs, stone) leave of it
    const foods = new Set(['wheat', 'bread', ...Z.preserved]);
    for (const b of mine) {
      const B = bp(S, b);
      if (!B.storage || b.site || (B.keeps && !B.keeps.includes('wheat'))) continue;
      let other = 0;
      for (const k in b.inv) if (!foods.has(k)) other += b.inv[k];
      storeRoom += B.capacity ? Math.max(0, B.capacity - other) : storeNeed;
    }
    shortages.push({ key: 'storage', store: true, sev: clamp01((storeNeed - storeRoom) / Math.max(1, storeNeed)), why: 'there is no room to store the grain for winter' });
  }
  // the dead waiting with no place for the settlement's custom: a graveyard (or another when it is full), a pyre, a dock
  if (S.people && town.rites.length && !hasPlace(S, town)) {
    const place = { burial: 'a graveyard', cremation: 'a pyre', ship: 'a dock to set them out to sea' }[town.custom];
    shortages.push({ key: 'rites', rite: true, sev: 1, why: `the dead wait for ${place}` });
  }
  // places of learning (with people on): a library to keep what it has learned, a school for its children, a university in a town
  if (S.people) {
    const K = S.content.tuning.knowledge, has = (kind: string) => mine.some(b => bp(S, b).learning === kind);
    const kids = people.filter(a => a.role === 'child').length;
    if ('library' in town.knows && !has('library') && Object.values(town.knows).some(k => k.by !== 'founders')) shortages.push({ key: 'learning', learn: 'library', sev: K.learningWeight, why: 'what it has learned should be kept' });
    if (!has('school') && kids >= K.schoolChildren) shortages.push({ key: 'learning', learn: 'school', sev: K.learningWeight, why: `${kids} children have no school` });
    if ('university' in town.knows && !has('university') && formOf(S, town) === 'town') shortages.push({ key: 'learning', learn: 'university', sev: K.learningWeight, why: 'scholars would find new ways sooner' });
  }
  // carts: a shed where its deliveries run long and it has none near the busiest district
  if (S.carts && 'cart_shed' in town.knows) {
    const sheds = mine.filter(b => bp(S, b).carts).length, want = Math.max(1, Math.floor(pop / P.villagersPerCartShed));
    const p = pressure(S, town, 'distance');
    if (p > 0 && sheds < want) shortages.push({ key: 'hauling', carts: true, sev: p * (1 - sheds / want), why: NEED_TEXT.distance });
  }
  // and an ox barn where they run longer still
  if (S.carts && 'ox_barn' in town.knows) {
    const barns = mine.filter(b => bp(S, b).oxen).length, want = Math.max(1, Math.floor(pop / P.villagersPerOxBarn));
    const p = pressure(S, town, 'long_hauls');
    if (p > 0 && barns < want) shortages.push({ key: 'hauling', oxen: true, sev: p * (1 - barns / want), why: NEED_TEXT.long_hauls });
  }
  // hardship: struck lately by a hazard it knows a counter for, with buildings at risk no counter guards
  if (S.hardship) for (const h of HAZARDS) {
    if (!struckLately(S, town, h) || !known(S, town).some(B => B.guards?.hazard === h)) continue;
    // like comforts, counters wait while bread is short: food first
    const open = unguarded(S, town, h);
    if (open > 0) shortages.push({ key: h, guard: h, sev: foodShort ? 0 : clamp01(open * S.content.tuning.hardship.guardWeight), why: NEED_TEXT[h] });
  }
  // the player's priorities weigh each need
  for (const sh of shortages) sh.sev = clamp01(sh.sev * (town.levers.priority[sh.key] ?? 1));
  shortages.sort((a, b) => b.sev - a.sev);
  return { storeNeed, storeRoom, town, pop, freeBeds, spareHands, coming, foodShort, movable, uncovered, hasDock, supply, demand, shortages };
}

/**
 * Specialisation, with trade on: a good outside the basics that this settlement makes none of and a neighbour makes
 * (or is building the maker of) is traded for, not made. The first imports have `import_patience_seconds` to come;
 * after that it keeps trading while imports bring at least `import_share` of what it uses, and builds its own maker
 * when they do not. Returns the neighbour it trades with, or null to make the good itself.
 */
export function importFrom(S: State, town: Town, g: ItemId, use = town.planner.use[g] || 0): Town | null {
  if (!S.trade || basics(S).has(g) || S.buildings.some(b => b.town === town.id && bp(S, b).output[g])) return null;
  const host = S.towns.find(o => o !== town && S.bmap.has(o.store) && S.buildings.some(b => b.town === o.id && !b.paused && bp(S, b).output[g]));
  if (!host) return null;
  const X = S.content.tuning.trade, since = (town.trade.waits[g] ??= S.t);
  const got = town.trade.imports[g] || 0;
  return S.t - since < X.importPatienceSeconds || (got > 0 && got >= use * X.importShare) ? host : null;
}

/** The basics: the food chain, the building goods and, with seasons, firewood, with everything that goes into making them. */
const basicSets = new WeakMap<object, { seasons: boolean; set: Set<ItemId> }[]>();
function basics(S: State): Set<ItemId> {
  const list = basicSets.get(S.content) ?? [];
  basicSets.set(S.content, list);
  const hit = list.find(e => e.seasons === S.seasons);
  if (hit) return hit.set;
  const out = new Set<ItemId>([...foodChainOf(S), ...T(S).buildGoods, ...(S.seasons ? ['logs'] : [])]);
  for (let grew = true; grew;) {
    grew = false;
    for (const B of Object.values(S.content.blueprints)) if (Object.keys(B.output).some(g => out.has(g))) for (const i in B.input) if (!out.has(i)) { out.add(i); grew = true; }
  }
  list.push({ seasons: S.seasons, set: out });
  return out;
}

/**
 * Short of food: a self-planning settlement whose bakeries (as its planner last counted them) make less bread than its
 * people, and one more, eat. Newcomers and births wait while it is.
 */
export function shortOfFood(S: State, town: Town): boolean {
  if (!town.planner.on) return false;
  // out of land for food: it found no room for a workplace of the food chain lately (bread's chain: an orchard
  // with no fertile land in reach is no reason to stop growing)
  const chain = foodChainOf(S), F = S.content.tuning.farms;
  for (const id in town.planner.noRoom) if (S.t - town.planner.noRoom[id] < T(S).noRoomRetrySeconds * 2 && Object.keys(S.content.blueprints[id]?.output ?? {}).some(g => chain.has(g) && !F.diet.includes(g))) return true;
  // bread made against bread eaten only with seasons: without them a shortfall shows at once as hunger, which keeps newcomers away by itself
  if (!S.seasons) return false;
  const food = Object.values(S.content.blueprints).find(B => B.homes)?.keepStocked;
  const g = food ? Object.keys(food)[0] : undefined;
  if (!g || !(g in town.planner.use)) return false;
  // what the planner found made: its use (demand) less the shortage it saw
  let made = town.planner.use[g] * (1 - (town.planner.wants[g] || 0));
  // with farms that grow, the foods of the diet feed people as bread does (their shortage is weighed at `diet_weight`)
  if (S.farms) for (const d of F.diet) made += (town.planner.use[d] || 0) * (1 - Math.min(1, (town.planner.wants[d] || 0) / F.dietWeight));
  let pop = 1;
  for (const a of S.agents) if (a.kind === 'villager' && a.home?.town === town.id) pop++;
  return made < (pop / S.content.tuning.needs.eatEverySeconds) * T(S).newcomerFoodShare;
}

const FORMS: Form[] = ['hamlet', 'village', 'town'];

/** A site that has waited `site_patience_seconds` for a good nobody in its settlement has. */
function starved(S: State, b: Building, town: Town): boolean {
  if (!b.site) return false;
  const B = bp(S, b);
  return Object.keys(B.cost).some(k => (b.inv[k] || 0) < B.cost[k] && k in b.waiting && S.t - b.waiting[k] > T(S).sitePatienceSeconds && supplyOf(S, k, town.id) <= 0);
}

/** A settlement's form, by its people: a hamlet, a village from `village_at`, a town from `town_at`. */
export function formOf(S: State, town: Town): Form {
  const pop = villagers(S).filter(a => a.home?.town === town.id).length, P = T(S);
  return pop >= P.townAt ? 'town' : pop >= P.villageAt ? 'village' : 'hamlet';
}

/**
 * The densest home the settlement knows and its form allows: the rung of the ladder it builds now.
 * With `afford`, the densest of those it can pay for today (a home built to bring a worker must not wait on the work).
 */
function homeFor(S: State, town: Town, afford = false): BlueprintDef | undefined {
  const f = FORMS.indexOf(formOf(S, town));
  const homes = known(S, town).filter(B => B.homes && FORMS.indexOf(B.form) <= f).sort((a, b) => b.homes / (b.w * b.h) - a.homes / (a.w * a.h) || b.homes - a.homes);
  return afford ? homes.find(B => !affordable(S, B, town)) ?? homes[homes.length - 1] : homes[0];
}

/** Propose: the best blueprint for a shortage, following a recipe's inputs when they would leave it idle. */
function propose(S: State, L: Look, sh: Shortage): Choice | null {
  const P = T(S);
  const relief = (B: BlueprintDef): number => {
    if (sh.homes) return B.homes && B === homeFor(S, L.town) ? clamp01(B.homes / Math.max(1, P.growthBeds - L.freeBeds)) : 0;
    if (sh.hauling) return B.couriers && L.uncovered >= P.minSeverity ? L.uncovered : 0;
    if (sh.crossing) return B.shore && !L.hasDock ? 1 : 0;
    if (sh.detours) return B.bridge ? 1 : 0;
    if (sh.carts) return B.carts ? 1 : 0;
    if (sh.oxen) return B.oxen ? 1 : 0;
    if (sh.rite) return B.rite === L.town.custom ? 1 : 0;
    if (sh.learn) return B.learning === sh.learn ? 1 : 0;
    if (sh.guard) return B.guards?.hazard === sh.guard ? 1 : 0;
    if (sh.store) return B.storage && (!B.keeps || B.keeps.includes('wheat')) ? clamp01((B.capacity || 300) / Math.max(1, L.storeNeed - L.storeRoom)) : 0;
    const add = B.seconds && B.output[sh.good!] ? B.output[sh.good!] / B.seconds : 0;
    const gap = Math.max(1e-6, (L.demand[sh.good!] || 0) - (L.supply[sh.good!] || 0));
    return clamp01(add / gap);
  };
  let best: BlueprintDef | null = null, bs = -Infinity;
  for (const B of known(S, L.town)) {
    const r = relief(B);
    if (r <= 0) continue;
    const cost = Object.values(B.cost).reduce((s, n) => s + n, 0);
    const score = sh.sev * r - P.costWeight * cost;
    if (score > bs) { bs = score; best = B; }
  }
  if (!best) return null;
  return { ...follow(S, L, { B: best, sev: sh.sev, why: sh.why }, 0), key: sh.key };
}

/** If the chosen producer would starve for an input, plan that input's producer first. */
function follow(S: State, L: Look, c: Choice, depth: number): Choice {
  if (depth > 3) return c;
  // food does not wait on newcomers who are not coming: while the settlement goes hungry or short of food,
  // a workplace in the food chain is built, and a hand moves to it from carrying or from outside the chain
  // (and so are the other basics, building materials and firewood: nothing else can be built without them)
  const outs = Object.keys(c.B.output), chain = foodChainOf(S), basic = basics(S);
  const urgent = !L.coming && L.movable && (outs.some(g => chain.has(g)) ? L.foodShort || L.town.fed < 1 : outs.some(g => basic.has(g)));
  if (c.B.workers && L.spareHands < c.B.workers && !urgent) {
    // nobody free to work it: newcomers will come if there are beds, otherwise build homes
    if (L.freeBeds > 0) return { ...c, wait: L.coming ? `Waiting for newcomers to work ${article(c.B.name)} ${c.B.name}: ${c.why}` : `No hands free for ${article(c.B.name)} ${c.B.name}, and no newcomers coming: ${c.why}` };
    const home = homeFor(S, L.town, true);
    if (home) return { B: home, sev: c.sev, why: `${c.why}, and a new ${c.B.name.toLowerCase()} would need a worker` };
  }
  for (const i in c.B.input) {
    const spare = (L.supply[i] || 0) - (L.demand[i] || 0);
    if (spare >= (c.B.input[i] / c.B.seconds) * T(S).inputCover || plentyInStore(S, L.town, i, L.demand[i] || 0)) continue;
    // an input it trades for, coming in but short: another user of it waits until more comes
    const from = (L.town.trade.imports[i] || 0) > 0 ? importFrom(S, L.town, i, (L.demand[i] || 0) + c.B.input[i] / c.B.seconds) : null;
    if (from) return { ...c, wait: `Waiting for more ${goodName(S, i)} from ${from.name} for ${article(c.B.name)} ${c.B.name}: ${c.why}` };
    const maker = known(S, L.town).find(B => B.seconds && B.output[i]);
    // a maker it has just found no room for doesn't hold this one back: build with the stock there is
    const noRoom = L.town.planner.noRoom[maker?.id ?? ''];
    if (!maker || maker === c.B || (noRoom !== undefined && S.t - noRoom < T(S).noRoomRetrySeconds)) continue;
    const users = c.B.name.toLowerCase();
    return follow(S, L, { B: maker, sev: c.sev, why: `${c.why}, and a new ${users} would need ${goodName(S, i)}` }, depth + 1);
  }
  return c;
}

const NOBUILD = 1 + ZONES.indexOf('nobuild');
const DEPOSITS = ['', 'fertile', 'stone', 'clay', 'fish', 'iron'];

/** Deposit tiles of `kind` within `r` of a point. */
function depositsNear(W: World, cx: number, cy: number, kind: string, r: number): number {
  const k = DEPOSITS.indexOf(kind);
  let n = 0;
  for (let y = Math.max(0, Math.floor(cy - r)); y <= Math.min(W.h - 1, Math.ceil(cy + r)); y++) for (let x = Math.max(0, Math.floor(cx - r)); x <= Math.min(W.w - 1, Math.ceil(cx + r)); x++) {
    if (W.deposit[y * W.w + x] === k && Math.hypot(x + 0.5 - cx, y + 0.5 - cy) <= r) n++;
  }
  return n;
}

/** Does a footprint touch land the player has zoned for no building? */
function onNoBuild(W: World, x: number, y: number, w: number, h: number): boolean {
  for (let j = y; j < y + h; j++) for (let k = x; k < x + w; k++) if (k >= 0 && j >= 0 && k < W.w && j < W.h && W.zone[j * W.w + k] === NOBUILD) return true;
  return false;
}

/** The storage yards at the heart of a settlement's districts, first district first. */
export function hubs(S: State, town: Town): Building[] {
  return town.districts.map(id => S.bmap.get(id)).filter((b): b is Building => !!b && !b.dead);
}

/** The buildings of one district: those nearer its centre than any other district's. */
function members(S: State, town: Town, hub: Building): Building[] {
  const hs = hubs(S, town), c = ctr(hub);
  return mineOf(S, town).filter(b => { const p = ctr(b), d = Math.hypot(p.x - c.x, p.y - c.y); return hs.every(o => o === hub || Math.hypot(p.x - ctr(o).x, p.y - ctr(o).y) >= d); });
}

/** How far a district reaches from its centre: `search_radius` beyond its farthest building, at most `search_radius_max`. */
function reachOf(S: State, town: Town, hub: Building): number {
  const P = T(S), c = ctr(hub);
  return Math.min(P.searchRadiusMax, Math.ceil(P.searchRadius + members(S, town, hub).reduce((m, b) => Math.max(m, Math.hypot(ctr(b).x - c.x, ctr(b).y - c.y)), 0)));
}

/**
 * A district splits off once the newest one holds `district_buildings` buildings: a storage yard is planned
 * as the new district's centre, on open land it can be walked to, about `district_spacing` from every other
 * centre, where there is most grass around to grow into. The newest district is where a settlement grows,
 * so each look only searches one district, and planning cost follows district size, not town size.
 */
function foundDistrict(S: State, town: Town): boolean {
  const P = T(S), W = S.world, hs = hubs(S, town), newest = hs[hs.length - 1];
  if (!newest || newest.site || members(S, town, newest).length < P.districtBuildings) return false;
  const B = S.content.blueprints.storage, first = door(hs[0]), reach = reachable(W, first.x, first.y), c = ctr(newest), RD = S.content.tuning.roads;
  const R = P.districtSpacing + 8;
  const cands: { x: number; y: number; s: number }[] = [];
  for (let y = Math.floor(c.y - R); y <= Math.ceil(c.y + R); y++) for (let x = Math.floor(c.x - R); x <= Math.ceil(c.x + R); x++) {
    W.work.plannerSpots++;
    const p = { x: x + B.w / 2, y: y + B.h / 2 };
    const d = hs.reduce((m, h) => Math.min(m, Math.hypot(ctr(h).x - p.x, ctr(h).y - p.y)), Infinity);
    if (d < P.districtSpacing * 0.8 || d > P.districtSpacing * 1.4) continue;
    if (!fits(S, 'storage', x, y, P.gap) || onNoBuild(W, x, y, B.w, B.h)) continue;
    const dr = door({ x, y, w: B.w, h: B.h });
    if (!reach[(dr.y + 1) * W.w + dr.x]) continue;
    let grass = 0, road = 0;
    for (let j = -8; j <= 8; j++) for (let k = -8; k <= 8; k++) { const xx = Math.round(p.x) + k, yy = Math.round(p.y) + j; if (xx >= 0 && yy >= 0 && xx < W.w && yy < W.h) { const i = yy * W.w + xx; if (W.ground[i] === 2 && W.bgrid[i] === -1) grass++; if (W.road[i] >= 2 && Math.abs(j) <= RD.districtReach && Math.abs(k) <= RD.districtReach) road++; } }
    // a new district grows along a road: its heart beside one, where the road runs on through open land
    cands.push({ x, y, s: Math.abs(d - P.districtSpacing) - P.districtRoomWeight * grass - (road ? RD.districtWeight : 0) });
  }
  cands.sort((a, b) => a.s - b.s);
  const best = cands.slice(0, 8).find(p => !cutsOff(S, town, 'storage', p.x, p.y));
  if (!best) return false;
  const b = placeBuilding(S, 'storage', best.x, best.y, false)!;
  b.town = town.id; b.priority = 1 + P.urgencyPriority; b.reason = `the heart of a new district: the old one has filled up`;
  town.districts.push(b.id);
  const Q = town.planner;
  Q.site = b.id; Q.placed++; Q.streak = { type: '', n: 0 };
  Q.status = `Founding district ${town.districts.length}: ${b.reason}`;
  chronicle(S, town.id, 'district', `${town.name} founded its district ${town.districts.length}`);
  emit(S, 'info', `${town.name}: ${Q.status}`);
  return true;
}

/** Place: score every free spot near the town for this blueprint; lower is better. */
export function chooseSpot(S: State, type: string, town: Town = S.towns[0], anyZone = false, hub?: Building): { x: number; y: number; rot: number } | null {
  const P = T(S), B = S.content.blueprints[type], W = S.world;
  // a settlement grows in its newest district: search around that district's centre (or the one asked for)
  const hs = hubs(S, town), store = hub ?? hs[hs.length - 1] ?? S.bmap.get(town.store);
  if (!store) return null;
  const home = ctr(store), mine = mineOf(S, town);
  const harvesters = S.buildings.filter(b => bp(S, b).harvest);
  const producersOf = (g: ItemId) => mine.filter(b => bp(S, b).output[g]);
  const usersOf = (g: ItemId) => mine.filter(b => { const O = bp(S, b); return O.input[g] || O.keepStocked[g]; });
  const houses = mine.filter(b => bp(S, b).homes);
  const unreached = B.couriers ? mine.filter(b => !b.site && !covered(S, ctr(b))) : [];
  // a counter goes where it guards buildings at risk that nothing guards yet
  const exposed = B.guards ? mine.filter(b => atRisk(S, b, B.guards!.hazard) && !guarded(S, b, B.guards!.hazard)) : [];
  // a dock has to face water that reaches the nearest neighbour's shore
  const facing = B.shore ? waterFacing(S, town) : null;
  const near = (p: { x: number; y: number }, bs: Building[]) => bs.reduce((m, b) => Math.min(m, Math.hypot(p.x - ctr(b).x, p.y - ctr(b).y)), Infinity);
  const mean = (p: { x: number; y: number }, bs: Building[]) => bs.reduce((s, b) => s + Math.hypot(p.x - ctr(b).x, p.y - ctr(b).y), 0) / bs.length;

  const scored: { x: number; y: number; rot: number; s: number }[] = [];
  // villages and towns set homes wall to wall: no ring of open land between a home and its neighbours
  const form = formOf(S, town), dense = !!B.homes && form !== 'hamlet', gap = dense ? 0 : P.gap;
  const homeAt = (i: number) => { const id = W.bgrid[i]; if (id < 0) return false; const o = S.bmap.get(id); return !!o && !!bp(S, o).homes; };
  const touchesNonHome = (x: number, y: number, bw: number, bh: number) => {
    for (let j = y - P.gap; j < y + bh + P.gap; j++) for (let k = x - P.gap; k < x + bw + P.gap; k++) {
      if (k < 0 || j < 0 || k >= W.w || j >= W.h) continue;
      const i = j * W.w + k;
      if (W.bgrid[i] >= 0 && !homeAt(i)) return true;
    }
    return false;
  };
  // only spots whose door can be walked to from storage: across a river is no use
  const from = door(store), reach = reachable(W, from.x, from.y);
  // the search reaches `search_radius` beyond the district's farthest building, so a growing district keeps finding room
  const R = reachOf(S, town, store), ox = Math.round(home.x - B.w / 2), oy = Math.round(home.y - B.h / 2);
  // zones the player painted: a building keeps to its own kind's zone while that zone has room in reach,
  // stays off other kinds' zones otherwise, and nothing is built on no-build land
  const mine1 = B.zone && !anyZone ? 1 + ZONES.indexOf(B.zone) : 0, nobuild = NOBUILD;
  // a zone belongs to the settlement whose first storage yard is nearest: neighbours keep off each other's
  const ours = (x: number, y: number) => S.towns.length < 2 || nearestTown(S, x + 0.5, y + 0.5) === town.id;
  // a zone of its kind within reach of any of the settlement's districts: search that zone, wherever it lies
  let zoned = false, x0 = ox - R, x1 = ox + R, y0 = oy - R, y1 = oy + R;
  if (mine1) {
    let zx0 = Infinity, zx1 = -Infinity, zy0 = Infinity, zy1 = -Infinity;
    for (const h of hubs(S, town).length ? hubs(S, town) : [store]) {
      const c = ctr(h), M = P.searchRadiusMax;
      for (let y = Math.max(0, Math.floor(c.y - M)); y <= Math.min(W.h - 1, Math.ceil(c.y + M)); y++) for (let x = Math.max(0, Math.floor(c.x - M)); x <= Math.min(W.w - 1, Math.ceil(c.x + M)); x++) {
        if (W.zone[y * W.w + x] !== mine1 || !ours(x, y)) continue;
        zx0 = Math.min(zx0, x); zx1 = Math.max(zx1, x); zy0 = Math.min(zy0, y); zy1 = Math.max(zy1, y);
      }
    }
    if (zx0 <= zx1) { zoned = true; x0 = zx0; x1 = zx1 - B.w + 1; y0 = zy0; y1 = zy1 - B.h + 1; }
  }
  const zoneOk = (x: number, y: number, strict: boolean, bw: number, bh: number) => {
    for (let j = y; j < y + bh; j++) for (let k = x; k < x + bw; k++) {
      const z = W.zone[j * W.w + k];
      if (z === nobuild || (strict ? z !== mine1 : z !== 0 && (z !== mine1 || !ours(k, j)))) return false;
    }
    return true;
  };
  // a dock turns to face any shore; everything else the planner builds faces south (the player turns what they place)
  for (const rot of B.shore ? [0, 1, 2, 3] : [0]) {
  const { w: bw, h: bh } = dims(B, rot);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    W.work.plannerSpots++;
    if (!fits(S, type, x, y, gap, rot)) continue;
    if (!zoneOk(x, y, zoned, bw, bh)) continue;
    const ore = B.deposit ? depositsNear(W, x + bw / 2, y + bh / 2, B.deposit.kind, B.deposit.radius + Math.max(bw, bh) / 2) : 0;
    if (B.deposit && !ore) continue;
    // homes share walls only with other homes: anything else keeps its ring of open land
    if (dense && touchesNonHome(x, y, bw, bh)) continue;
    const at = { x, y, w: bw, h: bh, rot }, dr = door(at), fr = frontOf(at), F = FACING[rot];
    const inside = (q: { x: number; y: number }) => q.x >= 0 && q.y >= 0 && q.x < W.w && q.y < W.h;
    if (!reach[dr.y * W.w + dr.x] && !(inside(fr) && reach[fr.y * W.w + fr.x])) continue;
    if (facing && !(inside(fr) && facing.has(facing.label[fr.y * W.w + fr.x]))) continue;
    const p = { x: x + bw / 2, y: y + bh / 2 };
    // homes and noisy workplaces stay apart
    if (B.homes && inNuisance(S, p)) continue;
    if (B.nuisance && S.buildings.some(o => bp(S, o).homes && Math.hypot(ctr(o).x - p.x, ctr(o).y - p.y) <= B.nuisance!.radius)) continue;
    let s = -P.depositWeight * ore + P.storeWeight * Math.hypot(p.x - home.x, p.y - home.y);
    if (B.harvest) {
      const trees = treeScore(S, p.x, p.y, B.harvest.radius, harvesters, P.sharedTreeWeight);
      if (trees < P.minTrees) continue;
      s -= P.treeWeight * trees;
    } else {
      // keep out of the woods and out of a forester's replanting ground
      for (let j = y - P.gap; j < y + bh + P.gap; j++) for (let k = x - P.gap; k < x + bw + P.gap; k++) if (W.tree[j * W.w + k] === 2) s += 1;
      for (const h of harvesters) if (Math.hypot(p.x - ctr(h).x, p.y - ctr(h).y) <= bp(S, h).harvest!.radius) s += P.forestPenalty;
    }
    // a farm that grows wants open land behind it to grow into (the planner's farms face south: behind is north)
    if (S.farms && B.grows && rot === 0) {
      let rows = 0;
      for (let k = 1; k <= maxSize(B) && rows === k - 1; k++) {
        let open = y - k >= 0;
        for (let i = x; open && i < x + bw; i++) { const t = (y - k) * W.w + i; open = (W.ground[t] === 1 || W.ground[t] === 2) && W.bgrid[t] === -1 && !W.road[t] && !W.front[t]; }
        if (open) rows++;
      }
      s -= S.content.tuning.farms.growRoomWeight * rows;
    }
    for (const i in B.input) { const from = producersOf(i); if (from.length) s += P.linkWeight * near(p, from); }
    for (const o in B.output) { const to = usersOf(o); if (to.length) s += P.linkWeight * mean(p, to); }
    if (B.homes && houses.length) s += P.linkWeight * near(p, houses);
    if (dense) {
      // rows: every tile of wall shared with another home, and a door onto a street
      let shared = 0;
      for (let j = y; j < y + bh; j++) { if (x > 0 && homeAt(j * W.w + x - 1)) shared++; if (x + bw < W.w && homeAt(j * W.w + x + bw)) shared++; }
      s -= P.rowWeight * shared;
      if (inside(fr) && W.road[fr.y * W.w + fr.x]) s -= P.streetWeight;
    }
    // built along the roads: a door onto one (its front tile on a road, or beside it), or looking straight down a short run to one
    if (W.roads > 0) {
      const Rd = S.content.tuning.roads, roadAt = (q: { x: number; y: number }) => inside(q) && W.road[q.y * W.w + q.x] >= 2;
      if (roadAt(fr) || roadAt({ x: fr.x + F[1], y: fr.y + F[0] }) || roadAt({ x: fr.x - F[1], y: fr.y - F[0] })) s -= Rd.frontWeight;
      else for (let k = 2; k <= Rd.nearTiles + 1; k++) { const q = { x: dr.x + F[0] * k, y: dr.y + F[1] * k }; if (!inside(q)) break; if (roadAt(q)) { s -= Rd.nearWeight; break; } if (W.bgrid[q.y * W.w + q.x] !== -1) break; }
    }
    if (B.couriers) {
      // a depot only helps where its bots reach buildings nobody's bots reach yet
      const reach = unreached.filter(b => Math.hypot(p.x - ctr(b).x, p.y - ctr(b).y) <= B.couriers!.radius).length;
      if (!reach) continue;
      s -= P.coverWeight * reach;
    }
    if (B.guards) {
      const n = exposed.filter(b => Math.hypot(p.x - ctr(b).x, p.y - ctr(b).y) <= B.guards!.radius).length;
      if (!n) continue;
      s -= P.coverWeight * n;
    }
    scored.push({ x, y, rot, s });
  }
  }
  // a zone with no spot that fits: fall back to unzoned land rather than build nothing
  if (zoned && !scored.length) return chooseSpot(S, type, town, true, hub);
  scored.sort((a, b) => a.s - b.s);
  // doors that can be reached now must stay reachable: a new building never seals off another's way in.
  // Judged from the settlement's first storage yard, which every district centre can reach.
  const main = S.bmap.get(town.store), root = main ? door(main) : from, rootReach = main ? reachable(W, root.x, root.y) : reach;
  // every settlement's doors: neighbours that grow into each other must not wall each other in
  const doors = S.buildings.filter(b => !b.dead && !bp(S, b).bridge).map(b => { const d = door(b); return d.y * W.w + d.x; }).filter(i => rootReach[i]);
  for (const c of scored.slice(0, 8)) {
    const at = { x: c.x, y: c.y, ...dims(B, c.rot), rot: c.rot }, d = door(at);
    if (!findPath(W, from.x, from.y, d.x, d.y)) continue;
    // the open tile in front of its door, or beside it for a building on the shore
    const o = B.shore ? beside(at) : frontOf(at), front = o.y * W.w + o.x;
    if (sealsOff(W, c.x, c.y, at.w, at.h, root, doors, rootReach[front] ? front : -1)) continue;
    return { x: c.x, y: c.y, rot: c.rot };
  }
  return null;
}

/**
 * Room on the shore for a dock where there is none: one of the settlement's finished workshops within `clear_reach`
 * tiles of water, cheapest first (up to `clear_tries` of them; never a home, a storage yard, a workplace of the food
 * chain, a bridge or a place of rites), whose ground would take the dock if it came down. It comes down, its carriers'
 * jobs cancelled and `salvage_share` of its cost back in storage, and the spot is returned.
 */
export function clearShore(S: State, town: Town, B: BlueprintDef): { spot: { x: number; y: number; rot: number }; cut: Building } | null {
  const P = T(S), W = S.world, chain = foodChainOf(S), store = S.bmap.get(town.store);
  if (!store) return null;
  const nearWater = (b: Building) => {
    for (let j = b.y - P.clearReach; j < b.y + b.h + P.clearReach; j++) for (let k = b.x - P.clearReach; k < b.x + b.w + P.clearReach; k++)
      if (k >= 0 && j >= 0 && k < W.w && j < W.h && W.ground[j * W.w + k] === 0) return true;
    return false;
  };
  const cost = (b: Building) => Object.values(bp(S, b).cost).reduce((s, n) => s + n, 0);
  const cands = mineOf(S, town).filter(b => {
    const O = bp(S, b);
    return !b.site && !O.homes && !O.storage && !O.bridge && !O.shore && !O.rite && !O.learning && !Object.keys(O.output).some(g => chain.has(g)) && nearWater(b);
  }).sort((a, b) => cost(a) - cost(b) || a.id - b.id).slice(0, P.clearTries);
  for (const b of cands) {
    const back = lift(S, b);
    let spot: { x: number; y: number; rot: number } | null = null;
    for (const h of hubs(S, town).reverse()) spot ??= chooseSpot(S, B.id, town, false, h);
    back();
    if (!spot) continue;
    for (const a of S.agents) if (touches(a, b)) cancelTask(a);
    demolish(S, b);
    for (const [k, n] of Object.entries(bp(S, b).cost)) { const m = Math.floor(n * P.salvageShare); if (m > 0) add(store.inv, k, m); }
    return { spot, cut: b };
  }
  return null;
}

/**
 * Where to bridge: from a bank tile storage can walk to, straight across up to `max_span` tiles of open water to
 * land on the far side. Scores each span by the grass within 8 of the far bank that cannot be walked to today
 * (`bridge_reach_weight` each), plus the tiles it would save on recent trips that went the long way round, less
 * `store_weight` times its distance from storage. The best span scoring at least `bridge_min_gain`, or null.
 */
function chooseBridge(S: State, B: BlueprintDef, town: Town) {
  const P = T(S), W = S.world, store = S.bmap.get(town.store);
  if (!store || !B.bridge) return null;
  const from = door(store), reach = reachable(W, from.x, from.y), home = ctr(store), mine = mineOf(S, town);
  const R = Math.min(P.searchRadiusMax, Math.ceil(P.searchRadius + mine.reduce((m, b) => Math.max(m, Math.hypot(ctr(b).x - home.x, ctr(b).y - home.y)), 0)));
  const bank = (i: number) => (W.ground[i] === 1 || W.ground[i] === 2) && W.bgrid[i] === -1 && !W.front[i];
  const open = (i: number) => !W.ground[i] && W.bgrid[i] === -1 && !W.bridge[i];
  const trips = town.detours.filter(t => S.t - t[5] < 300);
  const bridges = S.buildings.filter(b => bp(S, b).bridge);
  let best: { x: number; y: number; w: number; h: number; from: { x: number; y: number }; to: { x: number; y: number } } | null = null, bs = P.bridgeMinGain;
  for (let y = Math.max(1, Math.floor(home.y - R)); y <= Math.min(W.h - 2, Math.ceil(home.y + R)); y++) for (let x = Math.max(1, Math.floor(home.x - R)); x <= Math.min(W.w - 2, Math.ceil(home.x + R)); x++) {
    const n = y * W.w + x;
    if (!reach[n] || !bank(n)) continue;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      let k = 1;
      while (k <= B.bridge.maxSpan && x + dx * k >= 0 && y + dy * k >= 0 && x + dx * k < W.w && y + dy * k < W.h && open((y + dy * k) * W.w + x + dx * k)) k++;
      const fx = x + dx * k, fy = y + dy * k;
      if (k === 1 || k > B.bridge.maxSpan + 1 || fx < 0 || fy < 0 || fx >= W.w || fy >= W.h || !bank(fy * W.w + fx)) continue;
      W.work.plannerSpots++;
      const span = k - 1;
      // crossings keep `bridge_spacing` apart: one bridge serves the stretch of water around it
      if (bridges.some(b => Math.hypot(ctr(b).x - (x + fx) / 2, ctr(b).y - (y + fy) / 2) < P.bridgeSpacing)) continue;
      // land it opens: grass within 12 of the far bank that the bridge would connect and nobody can walk to yet
      const gain = reach[fy * W.w + fx] ? 0 : opensUp(W, fx, fy, reach, 12);
      let s = P.bridgeReachWeight * gain;
      // a trip counts only for a span its straight line passes: the water it went round is here
      const mx = (x + fx) / 2 + 0.5, my = (y + fy) / 2 + 0.5;
      for (const t of trips) {
        if (segmentDist(mx, my, t[0] + 0.5, t[1] + 0.5, t[2] + 0.5, t[3] + 0.5) > 2.5) continue;
        const via = Math.min(Math.hypot(t[0] - x, t[1] - y) + span + Math.hypot(fx - t[2], fy - t[3]), Math.hypot(t[0] - fx, t[1] - fy) + span + Math.hypot(x - t[2], y - t[3]));
        s += Math.max(0, t[4] - via);
      }
      s -= P.storeWeight * Math.hypot(x - home.x, y - home.y);
      if (s > bs) {
        bs = s;
        const sx = Math.min(x + dx, x + dx * span), sy = Math.min(y + dy, y + dy * span);
        best = { x: sx, y: sy, w: dx ? span : 1, h: dy ? span : 1, from: { x, y }, to: { x: fx, y: fy } };
      }
    }
  }
  return best;
}

/** Distance from a point to a line segment. */
function segmentDist(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
  const t = L ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L)) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** Grass tiles reachable on foot from (x, y) within `r` tiles of it, through land not already in `reach`. */
function opensUp(W: World, x: number, y: number, reach: Uint8Array, r: number): number {
  const seen = new Set<number>([y * W.w + x]), q = [y * W.w + x];
  let grass = 0;
  while (q.length) {
    const i = q.pop()!, cx = i % W.w, cy = (i / W.w) | 0;
    if (W.ground[i] === 2) grass++;
    for (const j of [cx > 0 ? i - 1 : -1, cx < W.w - 1 ? i + 1 : -1, i - W.w, i + W.w]) {
      if (j < 0 || j >= W.ground.length || seen.has(j) || reach[j]) continue;
      const jx = j % W.w, jy = (j / W.w) | 0;
      if (!W.ground[j] || W.ground[j] === 3 || W.bgrid[j] !== -1 || Math.hypot(jx - x, jy - y) > r) continue;
      seen.add(j); q.push(j);
    }
  }
  return grass;
}

/** Would `type` at (x, y) cut the settlement's first storage yard off from a door it reaches now, or from its own? */
function cutsOff(S: State, town: Town, type: string, x: number, y: number): boolean {
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

/**
 * The bodies of water that touch the nearest other settlement's land: a dock on one of them can
 * reach it. Labels every water tile by connected body (4-way), then collects the bodies next to
 * land connected to that settlement's storage yard.
 */
function waterFacing(S: State, town: Town): (Set<number> & { label: Int32Array }) | null {
  const w = S.world, N = w.w * w.h, home = S.bmap.get(town.store);
  let target: Building | undefined, best = Infinity;
  for (const t of S.towns) {
    const s = S.bmap.get(t.store);
    if (t === town || !s || !home) continue;
    const d = Math.hypot(s.x - home.x, s.y - home.y);
    if (d < best) { best = d; target = s; }
  }
  const label = new Int32Array(N).fill(-1), land = new Uint8Array(N);
  const flood = (start: number, water: boolean, mark: (i: number) => void, seen: (i: number) => boolean) => {
    const stack = [start];
    while (stack.length) {
      const i = stack.pop()!;
      if (seen(i) || (w.ground[i] === 0) !== water) continue;
      mark(i);
      const x = i % w.w, y = (i / w.w) | 0;
      if (x > 0) stack.push(i - 1);
      if (x < w.w - 1) stack.push(i + 1);
      if (y > 0) stack.push(i - w.w);
      if (y < w.h - 1) stack.push(i + w.w);
    }
  };
  let n = 0;
  for (let i = 0; i < N; i++) if (w.ground[i] === 0 && label[i] < 0) { const id = n++; flood(i, true, j => { label[j] = id; }, j => label[j] >= 0); }
  const out = new Set<number>() as Set<number> & { label: Int32Array };
  out.label = label;
  if (!target) { for (let k = 0; k < n; k++) out.add(k); return out; }
  const td = door(target);
  flood(td.y * w.w + td.x, false, j => { land[j] = 1; }, j => land[j] === 1);
  for (let i = 0; i < N; i++) {
    if (!land[i]) continue;
    const x = i % w.w, y = (i / w.w) | 0;
    for (const j of [x > 0 ? i - 1 : -1, x < w.w - 1 ? i + 1 : -1, y > 0 ? i - w.w : -1, y < w.h - 1 ? i + w.w : -1]) if (j >= 0 && label[j] >= 0) out.add(label[j]);
  }
  return out;
}

/** The first good this blueprint costs that the settlement cannot pay for yet, and how much it is short. */
function affordable(S: State, B: BlueprintDef, town: Town): { good: ItemId; short: number } | null {
  for (const k in B.cost) {
    let owed = 0;
    for (const b of S.buildings) if (b.site && b.town === town.id) owed += Math.max(0, (bp(S, b).cost[k] || 0) - (b.inv[k] || 0) - (b.incoming[k] || 0));
    const free = supplyOf(S, k, town.id) - owed;
    // with nothing yet making this good, keep back enough to build what makes it: never spend the last planks before a sawmill
    const makers = known(S, town).filter(M => M.output[k]);
    const keep = !B.output[k] && makers.length && !S.buildings.some(b => b.town === town.id && bp(S, b).output[k]) ? Math.min(...makers.map(M => M.cost[k] || 0)) : 0;
    if (free - keep < B.cost[k]) return { good: k, short: B.cost[k] + keep - free };
  }
  return null;
}

/**
 * Replanning: tear down old homes of a smaller rung where the new home would stand, as one block.
 * Every home it covers must be finished, of a sparser kind than the new one and at least `replan_min_age`
 * seconds in use; at least one of that kind must remain; the new home must add beds; and the settlement
 * must have free beds elsewhere for everyone living there, who move before anything comes down.
 * Demolition salvages `salvage_share` of the cost into the nearest storage yard. Picks the block that adds
 * the most beds, nearest its district centre. Returns false when there is none.
 */
function replan(S: State, town: Town, c: Choice): boolean {
  const P = T(S), B = c.B, W = S.world, store = S.bmap.get(town.store);
  if (!store) return false;
  const density = (X: BlueprintDef) => X.homes / (X.w * X.h);
  const homes = S.buildings.filter(b => b.town === town.id && !b.site && bp(S, b).homes);
  const old = (b: Building) => density(bp(S, b)) < density(B) && b.used >= P.replanMinAge;
  const kinds: Record<string, number> = {};
  for (const h of homes) kinds[h.type] = (kinds[h.type] || 0) + 1;
  const spare = (except: Set<Building>) => homes.reduce((n, h) => n + (except.has(h) ? 0 : bp(S, h).homes - h.residents.length), 0);
  const hub = ctr(store);
  let best: { x: number; y: number; covers: Building[]; s: number } | null = null;
  for (const h of homes) {
    if (!old(h)) continue;
    for (let y = h.y - (B.h - 1); y <= h.y + h.h - 1; y++) for (let x = h.x - (B.w - 1); x <= h.x + h.w - 1; x++) {
      W.work.plannerSpots++;
      // what the new home's footprint would cover
      const covers = new Set<Building>();
      let ok = true;
      for (let j = y; j < y + B.h && ok; j++) for (let k = x; k < x + B.w && ok; k++) {
        if (k < 0 || j < 0 || k >= W.w || j >= W.h) { ok = false; break; }
        const id = W.bgrid[j * W.w + k];
        if (id === -1) continue;
        const o = S.bmap.get(id);
        if (!o || o.town !== town.id || !bp(S, o).homes || o.site || !old(o)) ok = false; else covers.add(o);
      }
      if (!ok || !covers.size) continue;
      const lost = [...covers].reduce((n, o) => n + bp(S, o).homes, 0);
      if (B.homes <= lost) continue;
      const counts: Record<string, number> = {};
      for (const o of covers) counts[o.type] = (counts[o.type] || 0) + 1;
      if (Object.entries(counts).some(([k, n]) => kinds[k] - n < 1)) continue;
      const movers = [...covers].reduce((n, o) => n + o.residents.length, 0);
      if (spare(covers) < movers) continue;
      if (inNuisance(S, { x: x + B.w / 2, y: y + B.h / 2 }) || onNoBuild(W, x, y, B.w, B.h)) continue;
      if (!fitsWithout(S, B.id, x, y, covers, town)) continue;
      const s = B.homes - lost - 0.05 * Math.hypot(x + B.w / 2 - hub.x, y + B.h / 2 - hub.y);
      if (!best || s > best.s) best = { x, y, covers: [...covers], s };
    }
  }
  if (!best) return false;
  // everyone moves first, to the nearest free bed elsewhere
  const gone = new Set(best.covers);
  for (const o of best.covers) for (const id of [...o.residents]) {
    const a = S.amap.get(id);
    if (!a) continue;
    const to = homes.filter(h => !gone.has(h) && bp(S, h).homes > h.residents.length).sort((p, q) => Math.hypot(ctr(p).x - a.x, ctr(p).y - a.y) - Math.hypot(ctr(q).x - a.x, ctr(q).y - a.y))[0];
    if (!to) return false;
    o.residents = o.residents.filter(r => r !== id);
    a.home = to; to.residents.push(id);
  }
  for (const o of best.covers) {
    const salvage = Object.entries(bp(S, o).cost);
    demolish(S, o);
    for (const [k, n] of salvage) store.inv[k] = (store.inv[k] || 0) + Math.floor(n * P.salvageShare);
  }
  const b = placeBuilding(S, B.id, best.x, best.y, false)!;
  b.town = town.id;
  b.priority = 1 + Math.round(c.sev * P.urgencyPriority);
  b.reason = `replanned: ${best.covers.length} old home${best.covers.length > 1 ? 's' : ''} make way for ${B.homes} beds`;
  const Q = town.planner;
  Q.site = b.id; Q.placed++; Q.streak = { type: '', n: 0 };
  Q.status = `Replanning a block for ${article(B.name)} ${B.name}: ${b.reason}`;
  S.stats.replanned++;
  chronicle(S, town.id, 'replanned', `${town.name} replanned a block: ${b.reason}`);
  emit(S, 'info', `${town.name}: ${Q.status}`);
  return true;
}

/** Would `type` fit at (x, y) if the buildings in `without` were not there? Lifts them off the map to check. */
function fitsWithout(S: State, type: string, x: number, y: number, without: Set<Building>, town: Town): boolean {
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

/**
 * A town lays a street grid around each district centre that has none yet: rows every `street_every_rows`
 * tiles (so a terrace two tiles deep fits between, its door on the street below) and cross streets every
 * `street_every_cols`, within `street_radius`, on open land only: never through buildings, trees or rock.
 */
function layStreets(S: State, town: Town) {
  const P = T(S), W = S.world;
  for (const hub of town.districts) {
    if (town.streets.includes(hub)) continue;
    const b = S.bmap.get(hub);
    if (!b) continue;
    town.streets.push(hub);
    const d = frontOf(b), R = P.streetRadius;
    for (let y = d.y - R; y <= d.y + R; y++) for (let x = d.x - R; x <= d.x + R; x++) {
      if (x < 0 || y < 0 || x >= W.w || y >= W.h) continue;
      const row = ((y - d.y) % P.streetEveryRows + P.streetEveryRows) % P.streetEveryRows === 0;
      const col = ((x - d.x) % P.streetEveryCols + P.streetEveryCols) % P.streetEveryCols === 0;
      const i = y * W.w + x;
      // streets are paths; a road already there stays a road
      if ((row || col) && (W.ground[i] === 1 || W.ground[i] === 2) && W.bgrid[i] === -1 && W.tree[i] !== 2 && W.zone[i] !== NOBUILD && W.road[i] < 2) W.road[i] = 1;
    }
    emit(S, 'info', `${town.name} laid out streets: it has grown into a town`, true);
  }
}

/**
 * Desire paths: the most worn tiles around the settlement, worn past `pave_wear` footsteps, become road,
 * up to `pave_per_look` at a time. Roads follow where people really walk.
 */
function pave(S: State, town: Town) {
  const P = T(S), W = S.world, seen = new Set<number>(), worn: number[] = [];
  for (const hub of hubs(S, town)) {
  const home = ctr(hub), R = reachOf(S, town, hub);
  for (let y = Math.max(0, Math.floor(home.y - R)); y <= Math.min(W.h - 1, Math.ceil(home.y + R)); y++) for (let x = Math.max(0, Math.floor(home.x - R)); x <= Math.min(W.w - 1, Math.ceil(home.x + R)); x++) {
    const i = y * W.w + x;
    if (W.wear[i] >= P.paveWear && !W.road[i] && W.bgrid[i] === -1 && W.zone[i] !== NOBUILD && (W.ground[i] === 1 || W.ground[i] === 2) && !seen.has(i)) { seen.add(i); worn.push(i); }
  }
  }
  worn.sort((a, b) => W.wear[b] - W.wear[a] || a - b);
  for (const i of worn.slice(0, P.pavePerLook)) { W.road[i] = 1; W.tree[i] = 0; }
}

/** Advance every settlement's planner by dt. Called from tick(). */
export function plan(S: State, dt: number) {
  for (const town of S.towns) planTown(S, town, dt);
}

function planTown(S: State, town: Town, dt: number) {
  const Q = town.planner;
  if (!Q.on) return;
  Q.t -= dt;
  if (Q.t > 0) return;
  Q.t += T(S).intervalSeconds / town.levers.pace;
  if (Q.roads) pave(S, town);
  if (formOf(S, town) === 'town') layStreets(S, town);
  // a village or town that knows the road lays one now and then
  if (planRoads(S, town, T(S).intervalSeconds / town.levers.pace)) return;

  const mine = Q.site !== null ? S.bmap.get(Q.site) : undefined;
  // a site waits its turn, unless it has waited `site_patience_seconds` for a good nobody has: then plan around it
  if (mine?.site && !starved(S, mine, town)) { Q.status = `Building ${article(bp(S, mine).name)} ${bp(S, mine).name}: ${mine.reason}`; return; }
  if (Q.site !== null) { Q.site = null; Q.settle = T(S).settleSeconds / town.levers.pace; }
  if (Q.settle > 0) { Q.settle -= T(S).intervalSeconds / town.levers.pace; return; }

  // the worst shortage something known can relieve
  const L = look(S, town), worst = L.shortages[0];
  // what it is short of, for its porters to trade for: its shortages of goods, and what it is saving
  Q.wants = {}; Q.use = { ...L.demand };
  for (const sh of L.shortages) if (sh.good && sh.sev >= T(S).minSeverity) Q.wants[sh.good] = sh.sev;
  if (Q.saving) Q.wants[Q.saving.good] = Math.max(Q.wants[Q.saving.good] || 0, 0.5);
  // a crowded newest district splits off a new one
  if (formOf(S, town) !== 'hamlet' && foundDistrict(S, town)) return;
  // a town with beds to spare renews an old block now and then: sparse homes make way for its densest
  const dense = homeFor(S, town);
  if (dense && formOf(S, town) === 'town' && S.t - Q.replanAt >= T(S).replanEverySeconds && L.freeBeds > 0
    && replan(S, town, { B: dense, sev: T(S).minSeverity, why: 'the town is renewing its old streets' })) { Q.replanAt = S.t; return; }
  Q.want = null;
  if (!worst || worst.sev < T(S).minSeverity) { Q.streak = { type: '', n: 0 }; Q.status = `The ${formOf(S, town)} has what it needs`; return; }
  // something it recently found no room for waits `no_room_retry_seconds`; the next need goes ahead
  const roomless = (id: string) => id in Q.noRoom && S.t - Q.noRoom[id] < T(S).noRoomRetrySeconds;
  // what waits for hands to work it doesn't hold back the next need: the next that can go ahead does
  let c: Choice | null = null, blocked: Choice | null = null, waiting: Choice | null = null, trading: Shortage | null = null;
  for (const sh of L.shortages) {
    if (sh.sev < T(S).minSeverity) break;
    // what it trades for from a neighbour that makes it, it does not make
    if (sh.from) { trading ??= sh; continue; }
    c = propose(S, L, sh);
    if (c && roomless(c.B.id)) { blocked ??= c; c = null; continue; }
    if (c?.wait) { waiting ??= c; c = null; continue; }
    // short of a good whose maker it has just found no room for: saving would wait for good, so the next need goes ahead
    const owe = c ? affordable(S, c.B, town) : null, maker = owe ? known(S, town).find(B => B.seconds && B.output[owe.good]) : undefined;
    if (c && maker && roomless(maker.id) && (L.supply[owe!.good] || 0) <= 0) { blocked ??= { ...c, B: maker }; c = null; continue; }
    if (c) break;
  }
  if (!c && waiting) { Q.streak = { type: '', n: 0 }; Q.status = waiting.wait!; return; }
  if (!c && blocked) { Q.status = `No room for ${article(blocked.B.name)} ${blocked.B.name}: ${blocked.why}`; return; }
  if (!c && trading) { Q.streak = { type: '', n: 0 }; Q.status = `Trading with ${trading.from!.name} for ${goodName(S, trading.good!)}: ${trading.why}`; return; }
  if (!c) { Q.status = `Nothing the ${formOf(S, town)} knows would help: ${worst.why}`; return; }

  // what the village is working towards counts as use: it is not forgotten while saved for
  Q.want = c.B.id;
  // can't pay for it: if nothing makes the missing good, or the village has already been short of it
  // for longer than `save_patience_seconds`, whatever it was saving for, make more of it first
  const owe = affordable(S, c.B, town);
  if (owe) {
    if (Q.saving?.good !== owe.good) Q.saving = { good: owe.good, since: S.t };
    // (a good it trades for from a neighbour that makes it is waited for, not made)
    const from = importFrom(S, town, owe.good, L.demand[owe.good] || 0);
    const stuck = !from && ((L.supply[owe.good] || 0) <= 0 || S.t - Q.saving.since > T(S).savePatienceSeconds);
    const maker = stuck ? known(S, town).find(B => B.seconds && B.output[owe.good]) : undefined;
    if (maker) Q.saving.since = S.t;
    const why = `${runningLow(S, owe.good)} to build ${article(c.B.name)} ${c.B.name}`;
    if (maker && !affordable(S, maker, town)) c = follow(S, L, { B: maker, sev: c.sev, why }, 0);
    else { Q.status = from ? `Trading with ${from.name} for ${goodName(S, owe.good)} to build ${article(c.B.name)} ${c.B.name}: ${c.why}` : `Saving ${goodName(S, owe.good)} for ${article(c.B.name)} ${c.B.name}: ${c.why}`; return; }
    // what the maker led to (an input's maker, a home for its worker) must be affordable as well;
    // if it is not, build the maker itself: its inputs can follow, but nothing comes without it
    if (affordable(S, c.B, town)) c = { B: maker, sev: c.sev, why };
  }

  if (!owe) Q.saving = null;
  Q.streak = Q.streak.type === c.B.id ? { type: c.B.id, n: Q.streak.n + 1 } : { type: c.B.id, n: 1 };
  if (Q.streak.n < T(S).confirmCycles) { Q.status = `Thinking about ${article(c.B.name)} ${c.B.name}: ${c.why}`; return; }

  // a farm that can grow grows instead: new fields behind it, and a place for one more hand
  const grow = S.farms && c.B.grows ? toGrow(S, town, c.B) : null, fields = grow ? growFarm(S, grow, true) : null;
  if (grow && fields) {
    fields.priority = 1 + Math.round(c.sev * T(S).urgencyPriority);
    fields.reason = `${fields.reason}: ${c.why}`;
    Q.site = fields.id; Q.placed++; Q.streak = { type: '', n: 0 };
    delete Q.noRoom[c.B.id];
    if (c.key && !(c.key in Q.firstFor)) Q.firstFor[c.key] = S.t;
    const name = sizeName(S, grow);
    Q.status = `Growing ${article(name)} ${name.toLowerCase()}: ${c.why}`;
    emit(S, 'info', S.towns.length > 1 ? `${town.name}: ${Q.status}` : Q.status, true);
    return;
  }
  if (c.B.bridge) {
    const span = chooseBridge(S, c.B, town);
    if (!span) { Q.noRoom[c.B.id] = S.t; Q.streak = { type: '', n: 0 }; Q.status = `No place for ${article(c.B.name)} ${c.B.name}: ${c.why}`; return; }
    delete Q.noRoom[c.B.id];
    const b = placeBridge(S, span.x, span.y, span.w, span.h, span.from, span.to, town.id);
    b.priority = 1 + Math.round(c.sev * T(S).urgencyPriority);
    b.reason = c.why;
    Q.site = b.id; Q.placed++; Q.streak = { type: '', n: 0 };
    if (c.key && !(c.key in Q.firstFor)) Q.firstFor[c.key] = S.t;
    chronicle(S, town.id, 'bridge', `${town.name} planned a bridge: ${c.why}`);
    Q.status = `Planning ${article(c.B.name)} ${c.B.name}: ${c.why}`;
    emit(S, 'info', S.towns.length > 1 ? `${town.name}: ${Q.status}` : Q.status, true);
    return;
  }
  let spot = chooseSpot(S, c.B.id, town);
  // a dock looks along the shores of every district, newest first
  if (c.B.shore) for (const h of hubs(S, town).reverse()) spot ??= chooseSpot(S, c.B.id, town, false, h);
  // a dock with no shore left clears one: a workshop on the shore comes down for it, as roads clear their line
  if (!spot && c.B.shore) {
    const cleared = clearShore(S, town, c.B);
    if (cleared) {
      spot = cleared.spot;
      chronicle(S, town.id, 'dock', `${town.name} cleared ${article(bp(S, cleared.cut).name)} ${bp(S, cleared.cut).name.toLowerCase()} from its shore for a dock`);
    }
  }
  if (!spot) { Q.noRoom[c.B.id] = S.t; Q.streak = { type: '', n: 0 }; Q.status = `No room for ${article(c.B.name)} ${c.B.name}: ${c.why}`; return; }
  delete Q.noRoom[c.B.id];
  const b = placeBuilding(S, c.B.id, spot.x, spot.y, false, spot.rot)!;
  b.town = town.id;
  b.priority = 1 + Math.round(c.sev * T(S).urgencyPriority);
  b.reason = c.why;
  Q.site = b.id; Q.placed++; Q.streak = { type: '', n: 0 };
  if (c.key && !(c.key in Q.firstFor)) Q.firstFor[c.key] = S.t;
  Q.status = `Planning ${article(c.B.name)} ${c.B.name}: ${c.why}`;
  emit(S, 'info', S.towns.length > 1 ? `${town.name}: ${Q.status}` : Q.status, true);
}
