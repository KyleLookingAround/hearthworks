import { rand } from './rng.ts';
import { release, removeAgent } from './agents.ts';
import { skillPace } from './people.ts';
import { add, bp, completeSite, ctr, emit, foodsOf, inB, plant, seasonOf } from './world.ts';
import type { Building, ItemId, Level, State, Stock, Town } from './types.ts';

const setStatus = (b: Building, t: string, l: Level) => { b.status.t = t; b.status.l = l; };

function nearestGrownTree(S: State, b: Building, r: number): number {
  const w = S.world, c = ctr(b);
  let best = -1, bd = Infinity;
  for (let y = Math.floor(c.y - r); y <= c.y + r; y++) for (let x = Math.floor(c.x - r); x <= c.x + r; x++) {
    if (!inB(w, x, y)) continue;
    const i = y * w.w + x;
    if (w.tree[i] !== 2) continue;
    const d = Math.hypot(x + 0.5 - c.x, y + 0.5 - c.y);
    if (d <= r && d < bd) { bd = d; best = i; }
  }
  return best;
}

function replant(S: State, b: Building, r: number) {
  const w = S.world, c = ctr(b), spots: number[] = [];
  let trees = 0;
  for (let y = Math.floor(c.y - r); y <= c.y + r; y++) for (let x = Math.floor(c.x - r); x <= c.x + r; x++) {
    if (!inB(w, x, y) || Math.hypot(x + 0.5 - c.x, y + 0.5 - c.y) > r) continue;
    const i = y * w.w + x;
    if (w.tree[i]) trees++;
    else if (w.ground[i] === 2 && w.bgrid[i] === -1 && !w.road[i]) spots.push(i);
  }
  if (trees < S.content.tuning.production.maxTreesNearForester && spots.length) {
    const i = spots[Math.floor(rand(S.rng) * spots.length)];
    plant(w, i);
  }
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

export function wants(S: State, b: Building, form: string): Stock {
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
    if (form !== 'hamlet') for (const g of N.tierTwo) out[g] = N.extrasStock;
    if (form === 'town') for (const g of N.tierThree) out[g] = 1;
  }
  return out;
}

/** What homes eat and everything that goes into making it, once per content. */
const chains = new WeakMap<object, Set<string>>();
export function foodChainOf(S: State): Set<string> {
  let out = chains.get(S.content);
  if (out) return out;
  out = new Set(Object.values(S.content.blueprints).filter(B => B.homes).flatMap(B => Object.keys(B.keepStocked)));
  for (let grew = true; grew;) {
    grew = false;
    for (const B of Object.values(S.content.blueprints)) if (Object.keys(B.output).some(g => out!.has(g))) for (const i in B.input) if (!out.has(i)) { out.add(i); grew = true; }
  }
  chains.set(S.content, out);
  return out;
}

/**
 * Enough of a good: a self-planning settlement's stores hold `surplus_seconds` of what its planner uses of it
 * (at least `surplus_min`), its planner wants no more of it, and, with seasons on, for a good of the food chain
 * outside winter, the stores already hold the coming winter's meals with `winter_headroom`.
 */
export function enough(S: State, town: Town, g: ItemId): boolean {
  const P = S.content.tuning.production, Q = town.planner;
  if (!Q.on || (Q.wants[g] || 0) > 0) return false;
  const st = stocks(S, town.id), food = foodChainOf(S).has(g);
  // while the yards are nearly full (`store_full_share`), what lies outside the food chain needs only `surplus_full_seconds`:
  // logs and planks must not take the room the harvest needs
  const full = !food && st.room > 0 && st.held >= st.room * S.content.tuning.planner.storeFullShare;
  if ((st.goods[g] || 0) < Math.max(P.surplusMin, (Q.use[g] || 0) * (full ? P.surplusFullSeconds : P.surplusSeconds))) return false;
  if (S.seasons && seasonOf(S) !== 'winter' && food) {
    const Z = S.content.tuning.seasons;
    let food = 0;
    for (const f of ['wheat', 'bread', ...Z.preserved]) food += st.goods[f] || 0;
    if (food < (st.pop * Z.yearSeconds / 4 / S.content.tuning.needs.eatEverySeconds) * Z.winterHeadroom) return false;
  }
  return true;
}

/** A settlement's stores and people, counted once a tick. */
const counted = new WeakMap<State, { t: number; by: Map<number, { goods: Stock; pop: number; held: number; room: number }> }>();
function stocks(S: State, town: number): { goods: Stock; pop: number; held: number; room: number } {
  let c = counted.get(S);
  if (!c || c.t !== S.t) { c = { t: S.t, by: new Map() }; counted.set(S, c); }
  let out = c.by.get(town);
  if (out) return out;
  out = { goods: {}, pop: 0, held: 0, room: 0 };
  for (const o of S.buildings) {
    if (o.town !== town || o.site) continue;
    const O = bp(S, o);
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
 * Plenty in store: the settlement's stores hold `surplus_seconds` of `use` per second of a good (at least `surplus_min`),
 * and with seasons on, for a good of the food chain outside winter, the coming winter's meals as well. The planner
 * does not count a good it holds plenty of as short, whatever the rates.
 */
export function plentyInStore(S: State, town: Town, g: ItemId, use: number): boolean {
  const P = S.content.tuning.production, st = stocks(S, town.id);
  if ((st.goods[g] || 0) < Math.max(P.surplusMin, use * P.surplusSeconds)) return false;
  if (S.seasons && seasonOf(S) !== 'winter' && foodChainOf(S).has(g)) {
    const Z = S.content.tuning.seasons;
    let food = 0;
    for (const f of ['wheat', 'bread', ...Z.preserved]) food += st.goods[f] || 0;
    if (food < (st.pop * Z.yearSeconds / 4 / S.content.tuning.needs.eatEverySeconds) * Z.winterHeadroom) return false;
  }
  return true;
}

/** A workplace resting with enough in store: every good it makes is enough. Its worker goes carrying. */
export function enoughInStore(S: State, b: Building): boolean {
  const town = S.towns[b.town], outs = Object.keys(bp(S, b).output);
  return !!town && outs.length > 0 && outs.every(g => enough(S, town, g));
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
      // bread first, then preserved food
      const meal = foods.find(f => (b.inv[f] || 0) >= 1);
      if (meal) { add(b.inv, meal, -1); b.eat -= 1; b.hunger = 0; }
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
    setStatus(b, B.couriers ? `${b.bots.length} bots hauling` : B.guards ? ({ fire: 'Ready for fire', flood: 'Holding the water back', sickness: 'Keeping the sick apart', raids: 'Standing guard' })[B.guards.hazard] : 'Open', 'ok');
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
  const w = b.worker !== null ? S.amap.get(b.worker) : undefined;
  if (!w || w.state !== 'working') { setStatus(b, w ? 'Worker on the way' : 'No worker free', w ? 'wait' : 'bad'); return; }
  // a worker from a sick home stays in bed
  if (w.home && w.home.sick > 0) { setStatus(b, 'Its worker is sick in bed', 'bad'); return; }
  // counters have no recipe: their worker stands ready
  if (B.guards) { setStatus(b, { fire: 'The fire crew stands ready', flood: 'Holding the water back', sickness: 'The healer is in', raids: 'A lookout on watch' }[B.guards.hazard], 'ok'); return; }
  // places of learning have no recipe: their worker keeps, teaches or studies
  if (B.learning) { setStatus(b, { library: 'A scribe at work', school: 'Lessons under way', university: 'Scholars at their inquiries' }[B.learning], 'ok'); return; }
  const lacking = Object.keys(B.input).filter(k => (b.inv[k] || 0) < B.input[k]);
  if (lacking.length) { setStatus(b, `Needs ${itemsText(S, lacking)}`, 'bad'); return; }
  if (Object.keys(B.output).some(k => (b.inv[k] || 0) >= T.logistics.outputCap)) {
    // a worker left standing at a full workplace goes carrying instead
    b.stall += dt;
    if (b.stall >= T.logistics.releaseAfterSeconds) { b.stall = 0; release(S, b); }
    setStatus(b, 'Output full, waiting for a carrier', 'warn'); return;
  }
  // between cycles, a workplace whose goods the stores hold plenty of rests, and in time its worker goes carrying
  if (b.timer === 0 && enoughInStore(S, b)) {
    b.stall += dt;
    if (b.stall >= T.logistics.releaseAfterSeconds) { b.stall = 0; release(S, b); }
    setStatus(b, 'Enough in store: resting', 'wait'); return;
  }
  b.stall = 0;
  let tree = -1;
  if (B.harvest) {
    tree = nearestGrownTree(S, b, B.harvest.radius);
    if (tree < 0) { setStatus(b, 'No grown trees nearby', 'bad'); return; }
  }
  // tools speed the work up, and wear out
  const tooled = !!B.tools && (b.inv.tools || 0) >= 1;
  setStatus(b, tooled ? 'Working, with tools' : 'Working', 'ok');
  // working hours, by law
  const hours = S.towns[b.town]?.laws.hours, pace = hours === 'long' ? T.hardship.longPace : hours === 'short' ? T.hardship.shortPace : 1;
  b.timer += dt * (tooled ? B.tools!.speedup : 1) * skillPace(S, w, b) * pace;
  if (b.timer >= B.seconds) {
    b.timer = 0;
    if (tooled && ++b.wear >= B.tools!.wearCycles) { b.wear = 0; add(b.inv, 'tools', -1); }
    for (const k in B.input) add(b.inv, k, -B.input[k]);
    if (tree >= 0) plant(S.world, tree);
    for (const k in B.output) { add(b.inv, k, B.output[k]); add(S.stats.made, k, B.output[k]); if (S.towns[b.town]) add(S.towns[b.town].trade.made, k, B.output[k]); }
  }
}
