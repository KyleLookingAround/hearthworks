/** Sensing: one settlement's supply and demand, beds, hands and hauling, and each shortage scored 0 to 1. */
import { wantsBoat } from '../ships.ts';
import { NEED_TEXT, pressure } from '../knowledge.ts';
import { bp, ctr, villagers, hypot } from '../core.ts';
import { FROST_AT, seasonOf, storesOnTrack } from '../seasons.ts';
import { hasPlace } from '../people.ts';
import { reserve } from '../agents.ts';
import { enoughInStore, foodChainOf, plentyInStore } from '../production.ts';
import { atRisk, clean, struckLately, unguarded } from '../hardship.ts';
import { crew, places, unripe } from '../farms.ts';
import { HAZARDS, type Hazard, type Learning, type Building, type ItemId, type State, type Stock, type Town } from '../types.ts';
import { goodName, runningLow, plural, orList } from './text.ts';
import { clamp01, T, known, mineOf, covered, ownEffect, basics, starved, formOf, affordable } from './core.ts';

export interface Shortage { key: string; sev: number; why: string; guard?: Hazard; good?: ItemId; homes?: boolean; hauling?: boolean; crossing?: boolean; detours?: boolean; store?: boolean; rite?: boolean; carts?: boolean; oxen?: boolean; clean?: boolean; learn?: Learning; hall?: boolean; /** the mill (a windmill, a seed garden) whose workplaces stand bare */ mill?: string; ships?: boolean; /** traded for from this neighbour rather than made */ from?: Town; /** food spoiling in stores that do not keep it: units lost a minute, by good */ spoils?: Stock }
export interface Look { storeNeed: number; storeRoom: number; town: Town; pop: number; freeBeds: number; spareHands: number; coming: boolean; foodShort: boolean; movable: boolean; uncovered: number; hasDock: boolean; supply: Stock; demand: Stock; shortages: Shortage[] }

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
    if (phase < FROST_AT) {
      let stored = 0;
      for (const b of mine) if (bp(S, b).storage && !b.site) for (const g of ['wheat', 'bread', ...Z.preserved]) stored += b.inv[g] || 0;
      const winter = (pop * Z.yearSeconds / 4 / needs.eatEverySeconds) * Z.winterHeadroom, left = (FROST_AT - phase) * Z.yearSeconds;
      if (winter > stored) demand.wheat = (demand.wheat || 0) + (winter - stored) / Math.max(P.winterGapMinSeconds, left);
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
    shortages.push({ key: g.id, good: g.id, sev, why: comfort.has(g.id) ? `homes want ${goodName(S, g.id)}` : diet.has(g.id) ? `homes would ${g.id === 'milk' ? 'drink' : 'eat'} ${goodName(S, g.id)} with their bread` : runningLow(S, g.id) });
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
  // ships (with ships on): its people wait ashore for a free boat; a shipyard builds more, while the fleet wants them
  if (S.ships && hasDock && 'shipyard' in town.knows && !mine.some(b => bp(S, b).shipyard) && pressure(S, town, 'boats') > 0 && wantsBoat(S, town)) shortages.push({ key: 'ships', ships: true, sev: S.content.tuning.sea.shipyardWeight, why: NEED_TEXT.boats });
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
    const growing = (town.mood >= needs.migrateMinMood ? 1 : P.lowMoodGrowth) * (S.seasons && (seasonOf(S) === 'autumn' || seasonOf(S) === 'winter') ? 0 : 1);
    shortages.push({ key: 'beds', homes: true, sev: clamp01((P.growthBeds - freeBeds) / P.growthBeds) * growing * fed * P.growthWeight, why: 'no free beds for newcomers' });
  }
  // full stores: past `store_full_share` of their room, workshops stall with nowhere to put their goods
  {
    let held = 0, room = 0;
    for (const b of mine) { const B = bp(S, b); if (!B.storage || b.site || !B.capacity || B.keeps) continue; room += B.capacity; for (const k in b.inv) held += b.inv[k]; }
    const full = room ? held / room : 0;
    if (full >= P.storeFullShare) shortages.push({ key: 'storage', store: true, sev: clamp01((full - P.storeFullShare) / (1 - P.storeFullShare)), why: 'the stores are full' });
  }
  // spoilage: food rotting in stores that do not keep it, a full need at `spoil_full_per_minute` units lost a minute
  // (and none while food is short: food first);
  // a store that keeps it, or a workplace that turns it into food that keeps, relieves it
  {
    // (less the share of the rotting pile that stores keeping food, standing or on the way, have room for: the food
    // goes there as it comes, and what lies in the yards is eaten first)
    const spoils: Stock = {}, every = S.content.tuning.production.spoilEverySeconds;
    let lost = 0, pile = 0, room = 0;
    for (const b of mine) {
      const B = bp(S, b);
      if (!B.storage) continue;
      if (B.keeps && B.capacity) { let n = 0; if (!b.site) for (const k in b.inv) n += b.inv[k]; room += Math.max(0, B.capacity - n); }
      if (b.site) continue;
      for (const k in b.inv) {
        const G = S.content.goods[k];
        if (!G?.spoils || B.keeps?.includes(k)) continue;
        const n = Math.floor((b.inv[k] - (b.reserved[k] || 0)) * G.spoils) * 60 / every;
        if (n > 0) { spoils[k] = (spoils[k] || 0) + n; lost += n; pile += b.inv[k] - (b.reserved[k] || 0); }
      }
    }
    if (lost > 0) shortages.push({ key: 'spoilage', spoils, sev: foodShort ? 0 : clamp01(lost / P.spoilFullPerMinute) * clamp01(1 - room / pile) * P.spoilWeight, why: `${orList(Object.keys(spoils).sort((a, b) => spoils[b] - spoils[a]).map(g => goodName(S, g)))} ${Object.keys(spoils).length > 1 ? 'spoil' : 'spoils'} in the stores` });
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
    // a university in a village of `university_villagers` that keeps a library, once everyone is fed, its winter store is on track and its stores hold
    // `university_spare` times what one costs (it waits for spare stores, and never saves or opens a quarry for one), or in any town
    const U = S.content.blueprints.university;
    const spare = !!U && !affordable(S, { ...U, cost: Object.fromEntries(Object.entries(U.cost).map(([g, n]) => [g, n * K.universitySpare])) }, town);
    const village = formOf(S, town) === 'village' && has('library') && pop >= K.universityVillagers && town.fed >= 1 && storesOnTrack(S, town) && spare;
    if ('university' in town.knows && !has('university') && (formOf(S, town) === 'town' || village)) shortages.push({ key: 'learning', learn: 'university', sev: K.learningWeight, why: 'scholars would find new ways sooner' });
    // a printing house beside its library in a village or town that knows one: books make readers of the grown
    if (Object.keys(town.knows).some(id => S.content.blueprints[id]?.learning === 'press') && !has('press') && has('library') && formOf(S, town) !== 'hamlet') shortages.push({ key: 'learning', learn: 'press', sev: K.learningWeight, why: 'books would let everyone read' });
  }
  // planners as people (with people on): a village wants a town hall for its planner
  if (S.people && formOf(S, town) !== 'hamlet' && !mine.some(b => bp(S, b).hall)) shortages.push({ key: 'hall', hall: true, sev: P.hallWeight, why: 'its planner needs a hall to keep up with a village' });
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
  // mills: a settlement that knows one wants it where `mill_min` of the workplaces it mills stand with none in reach
  for (const M of known(S, town).filter(B => B.mills)) {
    const near = (b: Building) => mine.some(c => c.type === M.id && hypot(ctr(c).x - ctr(b).x, ctr(c).y - ctr(b).y) <= M.mills!.radius);
    const bare = mine.filter(b => !b.site && M.mills!.types.includes(b.type) && !near(b)).length;
    if (bare >= P.millMin) shortages.push({ key: 'mill', mill: M.id, sev: P.millWeight, why: `${bare} ${orList(M.mills!.types.map(k => plural(S.content.blueprints[k]?.name.toLowerCase() ?? k)))} work without a ${M.name.toLowerCase()}` });
  }
  // sanitation: a settlement struck by sickness that knows a bathhouse keeps its homes clean, once everyone is fed
  if (S.hardship && struckLately(S, town, 'sickness') && known(S, town).some(B => B.sanitation)) {
    const homes = mine.filter(b => atRisk(S, b, 'sickness')), dirty = homes.filter(b => !clean(S, b)).length;
    if (dirty > 0) shortages.push({ key: 'sickness', clean: true, sev: foodShort ? 0 : clamp01((dirty / homes.length) * S.content.tuning.hardship.guardWeight), why: 'sickness goes from home to home' });
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

/**
 * Short of food: a self-planning settlement whose bakeries (as its planner last counted them) make less bread than its
 * people, and one more, eat. Newcomers and births wait while it is.
 */
export function shortOfFood(S: State, town: Town): boolean {
  if (!town.planner.on) return false;
  // out of land for food: it found no room for a workplace of the food chain lately (bread's chain: an orchard
  // with no fertile land in reach is no reason to stop growing)
  const chain = foodChainOf(S), F = S.content.tuning.farms;
  let landless = false;
  for (const id in town.planner.noRoom) if (S.t - town.planner.noRoom[id] < T(S).noRoomRetrySeconds * 2 && Object.keys(S.content.blueprints[id]?.output ?? {}).some(g => chain.has(g) && !F.diet.includes(g))) landless = true;
  // bread made against bread eaten only with seasons, or out of land: without them a shortfall shows at once as hunger,
  // which keeps newcomers away by itself
  if (!S.seasons && !landless) return false;
  const food = Object.values(S.content.blueprints).find(B => B.homes)?.keepStocked;
  const g = food ? Object.keys(food)[0] : undefined;
  if (!g || !(g in town.planner.use)) return false;
  // what the planner found made: its use (demand) less the shortage it saw
  let made = town.planner.use[g] * (1 - (town.planner.wants[g] || 0));
  // with farms that grow, the foods of the diet feed people as bread does (their shortage is weighed at `diet_weight`)
  if (S.farms) for (const d of F.diet) made += (town.planner.use[d] || 0) * (1 - Math.min(1, (town.planner.wants[d] || 0) / F.dietWeight));
  let pop = 1;
  for (const a of S.agents) if (a.kind === 'villager' && a.home?.town === town.id) pop++;
  // out of land for food, a newcomer comes only while the food made feeds everyone and them in full
  return made < (pop / S.content.tuning.needs.eatEverySeconds) * (landless ? 1 : T(S).newcomerFoodShare);
}
