import { rand } from './rng.ts';
import { release, removeAgent } from './agents.ts';
import { feastStock, skillPace } from './people.ts';
import { add, bp, ctr, emit, inB, hypot } from './core.ts';
import { completeSite } from './buildings.ts';
import { plant } from './terrain.ts';
import { seasonOf } from './seasons.ts';
import { capOf, crew, dietOf, mealOf, places, unripe } from './farms.ts';
import { fleetText, launch, wantsBoat } from './ships.ts';
import type { Agent, Building, ItemId, Level, State, Stock, Town } from './types.ts';

const setStatus = (b: Building, t: string, l: Level) => { b.status.t = t; b.status.l = l; };
/** What a building without workers says it is doing: carts ready in a shed or barn, boats at a dock, a bridge open to walkers. Words only. */
function idleText(S: State, b: Building): string {
  const B = bp(S, b), n = B.oxen || B.carts;
  if (n) {
    let out = 0;
    for (const a of S.agents) if (a.cart === b.id) out++;
    const feed = S.content.tuning.logistics.oxFeed;
    if (B.oxen && Object.keys(B.keepStocked).some(g => (b.inv[g] || 0) < feed)) return 'The oxen wait for feed';
    const kind = B.oxen ? 'ox cart' : 'handcart', ready = n - out;
    return out >= n ? `Every ${kind} is out` : `${ready} ${kind}${ready > 1 ? 's' : ''} ready${out ? `, ${out} out` : ''}`;
  }
  if (B.shore) return fleetText(S, S.towns[b.town]) ?? 'Boats ready at the jetty';
  if (B.bridge) return 'Open to walkers';
  return 'Open';
}

function nearestGrownTree(S: State, b: Building, r: number): number {
  const w = S.world, c = ctr(b);
  let best = -1, bd = Infinity;
  for (let y = Math.floor(c.y - r); y <= c.y + r; y++) for (let x = Math.floor(c.x - r); x <= c.x + r; x++) {
    if (!inB(w, x, y)) continue;
    const i = y * w.w + x;
    if (w.tree[i] !== 2) continue;
    const d = hypot(x + 0.5 - c.x, y + 0.5 - c.y);
    if (d <= r && d < bd) { bd = d; best = i; }
  }
  return best;
}

function replant(S: State, b: Building, r: number) {
  const w = S.world, c = ctr(b), spots: number[] = [];
  let trees = 0;
  for (let y = Math.floor(c.y - r); y <= c.y + r; y++) for (let x = Math.floor(c.x - r); x <= c.x + r; x++) {
    if (!inB(w, x, y) || hypot(x + 0.5 - c.x, y + 0.5 - c.y) > r) continue;
    const i = y * w.w + x;
    if (w.tree[i]) trees++;
    else if (w.ground[i] === 2 && w.bgrid[i] === -1 && !w.road[i]) spots.push(i);
  }
  if (trees < S.content.tuning.production.maxTreesNearForester && spots.length) {
    const i = spots[Math.floor(rand(S.rng) * spots.length)];
    plant(w, i);
  }
}

/** The foods a home eats, in order: its own (bread), with farms that grow the foods of the diet, then the preserved foods when seasons are on. */
export function foodsOf(S: State, b: Building): string[] {
  const f = Object.keys(bp(S, b).keepStocked)[0];
  return f ? [f, ...(S.farms ? S.content.tuning.farms.diet : []), ...(S.seasons ? S.content.tuning.seasons.preserved : [])] : [];
}

/**
 * A home's tier by the goods on its shelves: 0 hungry, 1 fed (its food in stock), 2 also any of `tier_two`
 * (fish or cloth), 3 also all of `tier_three` (tools).
 */
export function homeTier(S: State, b: Building): number {
  const B = bp(S, b), N = S.content.tuning.needs;
  if (!B.homes || b.hunger > 0 || !foodsOf(S, b).some(f => (b.inv[f] || 0) > 0)) return 0;
  if (!N.tierTwo.some(g => (b.inv[g] || 0) >= 1)) return 1;
  return N.tierThree.every(g => (b.inv[g] || 0) >= 1) ? 3 : 2;
}

/**
 * What a building wants kept in stock: its blueprint's `keep_stocked`, tools for a workplace that uses them,
 * and for a home the comforts its settlement's form reaches for (tier two from a village, tier three in a town).
 */
/** A home in winter with no firewood. */
export const cold = (S: State, b: Building) => seasonOf(S) === 'winter' && !!bp(S, b).homes && b.residents.length > 0 && !((b.inv.logs || 0) >= 1);

/** What each building wants, worked out once a tick: it reads only the season, the settlement's form and rites, and the diet. */
const wanted = new WeakMap<Building, { t: number; form: string; custom: string | undefined; rites: boolean; out: Stock }>();
export function wants(S: State, b: Building, form: string): Stock {
  const town = S.towns[b.town], custom = town?.custom, rites = !!town?.rites.length, hit = wanted.get(b);
  if (hit && hit.t === S.t && hit.form === form && hit.custom === custom && hit.rites === rites) return hit.out;
  const out = wantsNow(S, b, form);
  wanted.set(b, { t: S.t, form, custom, rites, out });
  return out;
}

function wantsNow(S: State, b: Building, form: string): Stock {
  const B = bp(S, b), N = S.content.tuning.needs, out: Stock = { ...B.keepStocked }, season = seasonOf(S);
  // ahead of and through winter, homes keep firewood and some preserved food
  if (B.homes && (season === 'autumn' || season === 'winter')) {
    out.logs = S.content.tuning.seasons.firewoodStock;
    for (const g of S.content.tuning.seasons.preserved) out[g] = 2;
  }
  if (B.tools) out.tools = 1;
  // while the dead wait for their farewell, the pyre wants its logs and the dock the planks for a boat
  const town = S.towns[b.town];
  if (S.people && B.rite && town && town.custom === B.rite && town.rites.length) {
    if (B.rite === 'cremation') out.logs = S.content.tuning.people.pyreLogs;
    if (B.rite === 'ship') out.planks = S.content.tuning.people.shipPlanks;
  }
  if (B.homes) {
    // with farms that grow, a little of each food of the diet its settlement can get
    if (S.farms) for (const g of dietOf(S, b.town)) out[g] = S.content.tuning.farms.dietStock;
    if (form !== 'hamlet') for (const g of N.tierTwo) out[g] = N.extrasStock;
    if (form === 'town') for (const g of N.tierThree) out[g] = 1;
  }
  return out;
}

/** What homes eat (their bread and the foods of the diet) and everything that goes into making it, once per content. */
const chains = new WeakMap<object, Set<string>>();
export function foodChainOf(S: State): Set<string> {
  let out = chains.get(S.content);
  if (out) return out;
  out = new Set([...Object.values(S.content.blueprints).filter(B => B.homes).flatMap(B => Object.keys(B.keepStocked)), ...S.content.tuning.farms.diet]);
  for (let grew = true; grew;) {
    grew = false;
    for (const B of Object.values(S.content.blueprints)) if (Object.keys(B.output).some(g => out!.has(g))) for (const i in B.input) if (!out.has(i)) { out.add(i); grew = true; }
  }
  chains.set(S.content, out);
  return out;
}

/**
 * How many seconds of use a settlement's stores hold of a good: building goods and the rest `surplus_seconds`, for the
 * builds ahead; the food chain `fresh_seconds`, for the days ahead, save in autumn, when bakeries bake ahead for the
 * winter (in winter every hand is carrying, and a loaf in store is one leg from a home, grain two).
 */
export function stockSeconds(S: State, g: ItemId): number {
  const P = S.content.tuning.production;
  return foodChainOf(S).has(g) && seasonOf(S) !== 'autumn' ? P.freshSeconds : P.surplusSeconds;
}

/**
 * The winter store, with seasons on, for a good of the food chain that keeps (grain, smoked fish; not bread or milk,
 * which spoil): outside winter the stores hold the coming winter's meals with `winter_headroom`, for everyone housed
 * and everyone the free beds will bring. The grain is the store.
 */
function winterStored(S: State, g: ItemId, st: { goods: Stock; pop: number; beds: number }): boolean {
  if (!S.seasons || seasonOf(S) === 'winter' || !foodChainOf(S).has(g) || S.content.goods[g]?.spoils) return true;
  const Z = S.content.tuning.seasons;
  let food = 0;
  for (const f of ['wheat', 'bread', ...Z.preserved]) food += st.goods[f] || 0;
  return food >= ((st.pop + st.beds) * Z.yearSeconds / 4 / S.content.tuning.needs.eatEverySeconds) * Z.winterHeadroom;
}

/**
 * Enough of a good: a self-planning settlement's stores hold its stock (`stockSeconds` of what its planner uses of
 * it, at least `surplus_min`), its planner wants no more of it, and, with seasons on, for a good of the food chain
 * that keeps, the winter store is laid in (`winterStored`).
 */
export function enough(S: State, town: Town, g: ItemId): boolean {
  const P = S.content.tuning.production, Q = town.planner;
  if (!Q.on || (Q.wants[g] || 0) > 0) return false;
  const st = stocks(S, town.id), food = foodChainOf(S).has(g);
  // while the yards are nearly full (`store_full_share`), what lies outside the food chain needs only `surplus_full_seconds`:
  // logs and planks must not take the room the harvest needs
  const full = !food && st.room > 0 && st.held >= st.room * S.content.tuning.planner.storeFullShare;
  if ((st.goods[g] || 0) < Math.max(P.surplusMin, (Q.use[g] || 0) * (full ? P.surplusFullSeconds : stockSeconds(S, g))) + feastStock(S, town, g, st.pop)) return false;
  return winterStored(S, g, st);
}

/** A settlement's stores and people, counted once a tick. */
const counted = new WeakMap<State, { t: number; by: Map<number, { goods: Stock; pop: number; beds: number; held: number; room: number }> }>();
function stocks(S: State, town: number): { goods: Stock; pop: number; beds: number; held: number; room: number } {
  let c = counted.get(S);
  if (!c || c.t !== S.t) { c = { t: S.t, by: new Map() }; counted.set(S, c); }
  let out = c.by.get(town);
  if (out) return out;
  out = { goods: {}, pop: 0, beds: 0, held: 0, room: 0 };
  for (const o of S.buildings) {
    if (o.town !== town || o.site) continue;
    const O = bp(S, o);
    if (O.homes) out.beds += Math.max(0, O.homes - o.residents.length);
    if (!O.storage) continue;
    for (const k in o.inv) out.goods[k] = (out.goods[k] || 0) + o.inv[k];
    // the room of open yards (not granaries and warehouses kept for some goods), as the planner counts it
    if (O.capacity && !O.keeps) { out.room += O.capacity; for (const k in o.inv) out.held += o.inv[k]; }
  }
  for (const a of S.agents) if (a.kind === 'villager' && a.home?.town === town) out.pop++;
  c.by.set(town, out);
  return out;
}

/**
 * Plenty in store: the settlement's stores hold its stock of a good (`stockSeconds` of `use` per second, at least
 * `surplus_min`) and, for a good of the food chain that keeps, the winter store (`winterStored`). The planner does not
 * count a good it holds plenty of as short, whatever the rates.
 */
export function plentyInStore(S: State, town: Town, g: ItemId, use: number): boolean {
  const P = S.content.tuning.production, st = stocks(S, town.id);
  if ((st.goods[g] || 0) < Math.max(P.surplusMin, use * stockSeconds(S, g)) + feastStock(S, town, g, st.pop)) return false;
  return winterStored(S, g, st);
}

/** A workplace resting with enough in store: every good it makes is enough. Its worker goes carrying. */
export function enoughInStore(S: State, b: Building): boolean {
  const town = S.towns[b.town], outs = Object.keys(bp(S, b).output);
  // a shipyard rests while its settlement's fleet has the boats it wants
  if (bp(S, b).shipyard) return !wantsBoat(S, town);
  return !!town && outs.length > 0 && outs.every(g => enough(S, town, g));
}

/** The kinds of workplace something mills (a windmill its bakeries), worked out once per content. */
const MILLED = new WeakMap<object, Set<string>>();
const milledKinds = (S: State) => { let k = MILLED.get(S.content); if (!k) MILLED.set(S.content, k = new Set(Object.values(S.content.blueprints).flatMap(B => B.mills?.types ?? []))); return k; };

/** How much more a workplace yields for a building of its settlement within reach whose worker is at work (a windmill by a bakery): the best such factor, else 1. */
export const milledBy = (S: State, b: Building): number => bestMill(S, b).factor;

/** The best mill at work for a workplace: its factor, and what it gives (milled grain, better seed) for the workplace's status. */
function bestMill(S: State, b: Building): { factor: number; boon: string } {
  const out = { factor: 1, boon: '' };
  if (!milledKinds(S).has(b.type)) return out;
  const p = ctr(b);
  for (const c of S.buildings) {
    const C = bp(S, c).mills;
    if (!C || c.town !== b.town || c.site || !C.types.includes(b.type) || C.factor <= out.factor || c.worker === null) continue;
    if (S.amap.get(c.worker)?.state !== 'working' || hypot(ctr(c).x - p.x, ctr(c).y - p.y) > C.radius) continue;
    out.factor = C.factor; out.boon = C.boon;
  }
  return out;
}

const itemsText = (S: State, items: string[]) => items.map(k => S.content.goods[k]?.name.toLowerCase() ?? k).join(' and ');

export function updateBuilding(S: State, b: Building, dt: number) {
  run(S, b, dt);
  if (b.burn > 0) setStatus(b, 'On fire!', 'bad');
  else if (b.flood > 0) { b.flood = Math.max(0, b.flood - dt); setStatus(b, 'Flooded: the water stands in it', 'bad'); }
  else if (b.sick > 0) setStatus(b, 'Sickness in the house', 'bad');
  if (b.noWay !== null && S.t - b.noWay < S.content.tuning.logistics.noWayRetrySeconds) setStatus(b, 'No way in: nobody can walk to its door', 'bad');
}

function run(S: State, b: Building, dt: number) {
  const B = bp(S, b), T = S.content.tuning;

  if (b.site) {
    const missing = Object.keys(B.cost).filter(k => (b.inv[k] || 0) < B.cost[k]);
    if (missing.length) {
      const n = missing.reduce((s, k) => s + B.cost[k] - (b.inv[k] || 0), 0);
      setStatus(b, `Waiting for ${n} ${itemsText(S, missing)}`, 'wait');
    } else {
      b.build += dt;
      setStatus(b, 'Builders at work', 'wait');
      if (b.build >= T.production.buildSeconds) completeSite(S, b, true);
    }
    return;
  }

  if (B.homes) {
    const r = b.residents.length;
    if (!r) { setStatus(b, 'Empty, waiting for newcomers', 'wait'); return; }
    const food = Object.keys(B.keepStocked)[0], foods = foodsOf(S, b), laws = S.towns[b.town]?.laws;
    // rationing: everyone eats less often
    b.eat += (dt * r) / (T.needs.eatEverySeconds * (laws?.rationing ? T.hardship.rationFactor : 1));
    if (b.eat >= 1) {
      // bread first, then preserved food (with farms that grow, whichever it has gone longest without)
      const meal = mealOf(S, b, foods);
      if (meal) { add(b.inv, meal, -1); b.eat -= 1; b.hunger = 0; b.ate[meal] = S.t; add(S.stats.eaten, meal, 1); }
      else { b.eat = 1; b.hunger += dt; }
    }
    // in winter each resident burns a log every `firewood_every_seconds`; without one the home is cold
    if (seasonOf(S) === 'winter') {
      b.fire = Math.min(1, b.fire + (dt * r) / T.seasons.firewoodEverySeconds);
      if (b.fire >= 1 && (b.inv.logs || 0) >= 1) { add(b.inv, 'logs', -1); b.fire -= 1; }
    }
    if (b.hunger > 0) {
      setStatus(b, `Out of ${itemsText(S, [food])}`, 'bad');
      // the hungry leave, unless the law keeps them: then, after `starve_factor` times as long, one dies
      const stay = laws && !laws.leave;
      if (b.hunger > T.needs.leaveAfterHungrySeconds * (stay ? T.hardship.starveFactor : 1)) {
        const people = b.residents.map(id => S.amap.get(id)).filter(a => !!a);
        const leaver = people.find(a => a.role === 'carrier') ?? people[0];
        if (leaver && stay) { removeAgent(S, leaver); S.stats.deaths++; S.stats.starved++; if (S.people) S.towns[b.town].rites.push(S.t); emit(S, 'bad', `A villager starved: no ${itemsText(S, [food])} at home, and the law forbids leaving`); }
        else if (leaver) { removeAgent(S, leaver); S.stats.departures++; emit(S, 'bad', `A villager left: no ${itemsText(S, [food])} at home`); }
        b.hunger = 0; b.eat = 0;
      }
    } else if (!foods.some(f => (b.inv[f] || 0) > 0)) setStatus(b, `Last of the ${itemsText(S, [food])} eaten`, 'warn');
    else if (cold(S, b)) setStatus(b, 'Cold: no firewood', 'warn');
    else setStatus(b, ['', 'Fed and settled', 'Comfortable', 'Well off'][homeTier(S, b)], 'ok');
    // comforts (fish, cloth, tools) are used up slowly, one of each in stock per resident cycle
    b.extra += (dt * r) / T.needs.extrasEverySeconds;
    if (b.extra >= 1) { b.extra -= 1; for (const g of [...T.needs.tierTwo, ...T.needs.tierThree]) if ((b.inv[g] || 0) >= 1) add(b.inv, g, -1); }
    return;
  }

  if (!B.workers) {
    setStatus(b, B.couriers ? `${b.bots.length} bots hauling` : B.guards ? ({ fire: 'Ready for fire', flood: 'Holding the water back', sickness: 'Keeping the sick apart', raids: 'Standing guard' })[B.guards.hazard] : idleText(S, b), 'ok');
    return;
  }
  if (B.harvest?.replant && !b.paused) {
    b.plantT += dt;
    if (b.plantT >= T.production.replantEverySeconds) { b.plantT = 0; replant(S, b, B.harvest.radius); }
  }
  if (b.paused) { setStatus(b, 'Paused', 'wait'); return; }
  // nothing is made in a building on fire or under water
  if (b.burn > 0 || b.flood > 0) return;
  // in winter the fields rest and their workers go carrying
  if (B.seasonal && seasonOf(S) === 'winter') { if (b.worker !== null) release(S, b); setStatus(b, 'Winter: the fields rest', 'wait'); return; }
  // an orchard's young trees bear nothing for a while
  if (unripe(S, b)) { b.plantT += dt; setStatus(b, 'The young trees are not bearing yet', 'wait'); return; }
  const w = b.worker !== null ? S.amap.get(b.worker) : undefined;
  // the hands at work (a grown farm has more than one); a worker from a sick home stays in bed
  const team = b.hands.length ? crew(b).map(id => S.amap.get(id)).filter(a => !!a && a.state === 'working' && !(a.home && a.home.sick > 0)) as Agent[] : null;
  if (!team?.length) {
    // (a workplace without a worker, without its inputs or resting with enough in store stands idle: its planner may pull it down)
    if (!w || w.state !== 'working') { if (!w) b.idle += dt; setStatus(b, w ? 'Worker on the way' : 'No worker free', w ? 'wait' : 'bad'); return; }
    if (w.home && w.home.sick > 0) { setStatus(b, 'Its worker is sick in bed', 'bad'); return; }
  }
  // counters have no recipe: their worker stands ready
  if (B.guards) { setStatus(b, { fire: 'The fire crew stands ready', flood: 'Holding the water back', sickness: 'The healer is in', raids: 'A lookout on watch' }[B.guards.hazard], 'ok'); return; }
  // places of learning have no recipe: their worker keeps, teaches or studies
  if (B.learning) { setStatus(b, { library: 'A scribe at work', school: 'Lessons under way', university: 'Scholars at their inquiries', press: 'Printing books for every home' }[B.learning], 'ok'); return; }
  const lacking = Object.keys(B.input).filter(k => (b.inv[k] || 0) < B.input[k]);
  if (lacking.length) { b.idle += dt; setStatus(b, `Needs ${itemsText(S, lacking)}`, 'bad'); return; }
  if (Object.keys(B.output).some(k => (b.inv[k] || 0) >= capOf(S, b))) {
    // a worker left standing at a full workplace goes carrying instead
    b.stall += dt;
    if (b.stall >= T.logistics.releaseAfterSeconds) { b.stall = 0; release(S, b); }
    setStatus(b, 'Output full, waiting for a carrier', 'warn'); return;
  }
  // between cycles, a workplace whose goods the stores hold plenty of rests, and in time its worker goes carrying
  if (b.timer === 0 && enoughInStore(S, b)) {
    b.stall += dt; b.idle += dt;
    if (b.stall >= T.logistics.releaseAfterSeconds) { b.stall = 0; release(S, b); }
    setStatus(b, B.shipyard ? 'The fleet has the boats it needs: resting' : 'Enough in store: resting', 'wait'); return;
  }
  b.stall = 0;
  let tree = -1;
  if (B.harvest) {
    tree = nearestGrownTree(S, b, B.harvest.radius);
    if (tree < 0) { b.idle += dt; setStatus(b, 'No grown trees nearby', 'bad'); return; }
  }
  b.idle = 0;
  // tools speed the work up, and wear out; a mill at work nearby makes each batch yield more
  const tooled = !!B.tools && (b.inv.tools || 0) >= 1, n = places(S, b), milled = bestMill(S, b), mill = milled.factor;
  setStatus(b, (tooled ? 'Working, with tools' : 'Working') + (mill > 1 ? `${tooled ? ' and' : ', with'} ${milled.boon}` : '') + (n > 1 ? `: ${team?.length ?? 1} of ${n} hands` : ''), 'ok');
  // working hours, by law
  const hours = S.towns[b.town]?.laws.hours, pace = hours === 'long' ? T.hardship.longPace : hours === 'short' ? T.hardship.shortPace : 1;
  // every hand at work adds their own pace
  b.timer += dt * (tooled ? B.tools!.speedup : 1) * (team ? team.reduce((s, a) => s + skillPace(S, a, b), 0) : skillPace(S, w!, b)) * pace;
  if (b.timer >= B.seconds) {
    b.timer = 0;
    if (tooled && ++b.wear >= B.tools!.wearCycles) { b.wear = 0; add(b.inv, 'tools', -1); }
    for (const k in B.input) add(b.inv, k, -B.input[k]);
    if (tree >= 0) plant(S.world, tree);
    for (const k in B.output) {
      // milled: `factor` times the yield, the part beyond a whole good carried over to the next batch
      let n = B.output[k];
      if (mill > 1) { b.extra += n * (mill - 1); const more = Math.floor(b.extra + 1e-9); b.extra -= more; n += more; }
      add(b.inv, k, n); add(S.stats.made, k, n); if (S.towns[b.town]) add(S.towns[b.town].trade.made, k, n); b.made += n;
    }
    // a shipyard's batch is a boat for its settlement's fleet
    if (B.shipyard && S.towns[b.town]) { launch(S, b); b.made++; }
  }
}
