/**
 * The village planner. Every `interval_seconds` it looks at the town, finds
 * the worst shortage, picks the blueprint that relieves it best for its cost,
 * chooses a site and posts it to the job board like any other building.
 *
 * Nothing here names a building type: what a blueprint relieves is read from
 * its recipe, homes and harvest fields, so new blueprints in design/ join in.
 * Deterministic: no randomness at all, ties break by scan order.
 */
import { findPath } from './path.ts';
import { supplyOf } from './logistics.ts';
import { fits } from './place.ts';
import { NEED_TEXT, pressure } from './knowledge.ts';
import { bp, ctr, door, emit, placeBuilding, villagers } from './world.ts';
import type { BlueprintDef, Building, ItemId, PlannerState, State, Stock, Town } from './types.ts';

export const plannerOn = (on: boolean): PlannerState => ({ on, t: 0, settle: 0, streak: { type: '', n: 0 }, site: null, want: null, status: on ? 'Looking around the village' : 'Village plans are off', placed: 0 });

interface Shortage { key: string; sev: number; why: string; good?: ItemId; homes?: boolean; hauling?: boolean }
interface Choice { B: BlueprintDef; sev: number; why: string; wait?: string }
interface Look { town: Town; pop: number; freeBeds: number; spareHands: number; uncovered: number; supply: Stock; demand: Stock; shortages: Shortage[] }

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
  for (const b of producers) { const B = bp(S, b); for (const i in B.input) demand[i] = (demand[i] || 0) + B.input[i] / B.seconds; }
  // chain pass: a producer short of inputs delivers only the share its inputs allow
  let eff = new Map(own);
  for (let pass = 0; pass < 3; pass++) {
    for (const k in supply) supply[k] = 0;
    for (const b of producers) { const B = bp(S, b); for (const o in B.output) supply[o] = (supply[o] || 0) + (B.output[o] / B.seconds) * eff.get(b)!; }
    const next = new Map<Building, number>();
    for (const b of producers) {
      const B = bp(S, b);
      let e = own.get(b)!;
      for (const i in B.input) e = Math.min(e, demand[i] ? clamp01((supply[i] || 0) / demand[i]) : 1);
      next.set(b, e);
    }
    eff = next;
  }

  const people = villagers(S).filter(a => a.home?.town === town.id), pop = people.length;
  let freeBeds = 0, food: ItemId | null = null;
  for (const b of mine) {
    const B = bp(S, b);
    if (!B.homes) continue;
    freeBeds += B.homes - b.residents.length;
    food ??= Object.keys(B.keepStocked)[0] ?? null;
  }

  const shortages: Shortage[] = [];
  if (food) {
    // feed everyone here plus everyone the free beds will bring
    demand[food] = (demand[food] || 0) + ((pop + freeBeds) / needs.eatEverySeconds) * P.foodHeadroom;
  }
  // planks build everything: want a steady flow that grows with the town
  for (const g of buildGoods(S)) demand[g] = (demand[g] || 0) + (pop * P.planksPerVillagerMinute) / 60;

  const goods = Object.values(S.content.goods).sort((a, b) => (a.id === food ? -1 : b.id === food ? 1 : a.order - b.order));
  for (const g of goods) {
    const d = demand[g.id] || 0;
    if (d <= 0) continue;
    shortages.push({ key: g.id, good: g.id, sev: clamp01(1 - (supply[g.id] || 0) / d), why: runningLow(S, g.id) });
  }
  // hauling: carriers run off their feet; machines that haul relieve it where they reach.
  // Listed before beds so that, at full strain, it wins a tie with growth.
  const stops = mine.filter(b => !b.site);
  const uncovered = stops.length ? stops.filter(b => !covered(S, ctr(b))).length / stops.length : 0;
  shortages.push({ key: 'hauling', hauling: true, sev: clamp01(pressure(S, town, 'hauling') * P.haulWeight), why: NEED_TEXT.hauling });
  // labour: villagers free to take a new job, keeping a share of the town hauling
  const carriers = people.filter(a => a.role === 'carrier' && a.state !== 'visit').length;
  const openJobs = mine.filter(b => bp(S, b).workers && b.worker === null).length;
  const spareHands = carriers - Math.max(1, Math.ceil(pop * P.carrierShare)) - openJobs;
  const idleJobs = mine.filter(b => !b.site && bp(S, b).workers && b.worker === null).length;
  if (idleJobs > freeBeds) shortages.push({ key: 'beds', homes: true, sev: 1, why: idleJobs > 1 ? `${idleJobs} workplaces have nobody to staff them` : 'a workplace has nobody to staff it' });
  else {
    // don't invite newcomers the village can't feed yet
    const fed = (shortages.find(s => s.good === food)?.sev ?? 0) < P.minSeverity ? 1 : 0;
    const growing = town.mood >= needs.migrateMinMood ? 1 : 0.5;
    shortages.push({ key: 'beds', homes: true, sev: clamp01((P.growthBeds - freeBeds) / P.growthBeds) * growing * fed * P.growthWeight, why: 'no free beds for newcomers' });
  }
  shortages.sort((a, b) => b.sev - a.sev);
  return { town, pop, freeBeds, spareHands, uncovered, supply, demand, shortages };
}

/** Goods that construction costs are paid in. */
function buildGoods(S: State): ItemId[] {
  const out = new Set<ItemId>();
  for (const B of Object.values(S.content.blueprints)) for (const k in B.cost) out.add(k);
  return [...out];
}

/** Propose: the best blueprint for a shortage, following a recipe's inputs when they would leave it idle. */
function propose(S: State, L: Look, sh: Shortage): Choice | null {
  const P = T(S);
  const relief = (B: BlueprintDef): number => {
    if (sh.homes) return B.homes ? clamp01(B.homes / Math.max(1, P.growthBeds - L.freeBeds)) : 0;
    if (sh.hauling) return B.couriers && L.uncovered >= P.minSeverity ? L.uncovered : 0;
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
  return follow(S, L, { B: best, sev: sh.sev, why: sh.why }, 0);
}

/** If the chosen producer would starve for an input, plan that input's producer first. */
function follow(S: State, L: Look, c: Choice, depth: number): Choice {
  if (depth > 3) return c;
  // carriers already run off their feet can't spare one for a new workplace
  const strained = pressure(S, L.town, 'hauling') >= S.content.tuning.knowledge.struggleSeverity;
  if (c.B.workers && (L.spareHands < c.B.workers || strained)) {
    // nobody free to work it: newcomers will come if there are beds, otherwise build homes
    if (L.freeBeds > 0) return { ...c, wait: `Waiting for newcomers to work ${article(c.B.name)} ${c.B.name}: ${c.why}` };
    const home = known(S, L.town).filter(B => B.homes).sort((a, b) => b.homes - a.homes)[0];
    if (home) return { B: home, sev: c.sev, why: `${c.why}, and a new ${c.B.name.toLowerCase()} would need a worker` };
  }
  for (const i in c.B.input) {
    const spare = (L.supply[i] || 0) - (L.demand[i] || 0);
    if (spare >= (c.B.input[i] / c.B.seconds) * T(S).inputCover) continue;
    const maker = known(S, L.town).find(B => B.seconds && B.output[i]);
    if (!maker || maker === c.B) continue;
    const users = c.B.name.toLowerCase();
    return follow(S, L, { B: maker, sev: c.sev, why: `${c.why}, and a new ${users} would need ${goodName(S, i)}` }, depth + 1);
  }
  return c;
}

/** Place: score every free spot near the town for this blueprint; lower is better. */
export function chooseSpot(S: State, type: string, town: Town = S.towns[0]): { x: number; y: number } | null {
  const P = T(S), B = S.content.blueprints[type], W = S.world;
  const store = S.bmap.get(town.store);
  if (!store) return null;
  const home = ctr(store), mine = mineOf(S, town);
  const harvesters = S.buildings.filter(b => bp(S, b).harvest);
  const producersOf = (g: ItemId) => mine.filter(b => bp(S, b).output[g]);
  const usersOf = (g: ItemId) => mine.filter(b => { const O = bp(S, b); return O.input[g] || O.keepStocked[g]; });
  const houses = mine.filter(b => bp(S, b).homes);
  const unreached = B.couriers ? mine.filter(b => !b.site && !covered(S, ctr(b))) : [];
  const near = (p: { x: number; y: number }, bs: Building[]) => bs.reduce((m, b) => Math.min(m, Math.hypot(p.x - ctr(b).x, p.y - ctr(b).y)), Infinity);
  const mean = (p: { x: number; y: number }, bs: Building[]) => bs.reduce((s, b) => s + Math.hypot(p.x - ctr(b).x, p.y - ctr(b).y), 0) / bs.length;

  const scored: { x: number; y: number; s: number }[] = [];
  const R = P.searchRadius, ox = Math.round(home.x - B.w / 2), oy = Math.round(home.y - B.h / 2);
  for (let y = oy - R; y <= oy + R; y++) for (let x = ox - R; x <= ox + R; x++) {
    if (!fits(S, type, x, y, P.gap)) continue;
    const p = { x: x + B.w / 2, y: y + B.h / 2 };
    let s = P.storeWeight * Math.hypot(p.x - home.x, p.y - home.y);
    if (B.harvest) {
      const trees = treeScore(S, p.x, p.y, B.harvest.radius, harvesters, P.sharedTreeWeight);
      if (trees < P.minTrees) continue;
      s -= P.treeWeight * trees;
    } else {
      // keep out of the woods and out of a forester's replanting ground
      for (let j = y - P.gap; j < y + B.h + P.gap; j++) for (let k = x - P.gap; k < x + B.w + P.gap; k++) if (W.tree[j * W.w + k] === 2) s += 1;
      for (const h of harvesters) if (Math.hypot(p.x - ctr(h).x, p.y - ctr(h).y) <= bp(S, h).harvest!.radius) s += P.forestPenalty;
    }
    for (const i in B.input) { const from = producersOf(i); if (from.length) s += P.linkWeight * near(p, from); }
    for (const o in B.output) { const to = usersOf(o); if (to.length) s += P.linkWeight * mean(p, to); }
    if (B.homes && houses.length) s += P.linkWeight * near(p, houses);
    if (B.couriers) {
      // a depot only helps where its bots reach buildings nobody's bots reach yet
      const reach = unreached.filter(b => Math.hypot(p.x - ctr(b).x, p.y - ctr(b).y) <= B.couriers!.radius).length;
      if (!reach) continue;
      s -= P.coverWeight * reach;
    }
    scored.push({ x, y, s });
  }
  scored.sort((a, b) => a.s - b.s);
  const from = door(store);
  for (const c of scored.slice(0, 8)) {
    const d = { x: c.x + Math.floor(B.w / 2), y: c.y + B.h - 1 };
    if (findPath(W, from.x, from.y, d.x, d.y)) return { x: c.x, y: c.y };
  }
  return null;
}

/** The first good this blueprint costs that the settlement cannot pay for yet, and how much it is short. */
function affordable(S: State, B: BlueprintDef, town: Town): { good: ItemId; short: number } | null {
  for (const k in B.cost) {
    let owed = 0;
    for (const b of S.buildings) if (b.site && b.town === town.id) owed += Math.max(0, (bp(S, b).cost[k] || 0) - (b.inv[k] || 0) - (b.incoming[k] || 0));
    const free = supplyOf(S, k, town.id) - owed;
    if (free < B.cost[k]) return { good: k, short: B.cost[k] - free };
  }
  return null;
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
  Q.t += T(S).intervalSeconds;

  const mine = Q.site !== null ? S.bmap.get(Q.site) : undefined;
  if (mine?.site) { Q.status = `Building ${article(bp(S, mine).name)} ${bp(S, mine).name}: ${mine.reason}`; return; }
  if (Q.site !== null) { Q.site = null; Q.settle = T(S).settleSeconds; }
  if (Q.settle > 0) { Q.settle -= T(S).intervalSeconds; return; }

  // the worst shortage something known can relieve
  const L = look(S, town), worst = L.shortages[0];
  Q.want = null;
  if (!worst || worst.sev < T(S).minSeverity) { Q.streak = { type: '', n: 0 }; Q.status = 'The village has what it needs'; return; }
  let c: Choice | null = null;
  for (const sh of L.shortages) {
    if (sh.sev < T(S).minSeverity) break;
    if ((c = propose(S, L, sh))) break;
  }
  if (!c) { Q.status = `Nothing the village knows would help: ${worst.why}`; return; }
  if (c.wait) { Q.streak = { type: '', n: 0 }; Q.status = c.wait; return; }

  // what the village is working towards counts as use: it is not forgotten while saved for
  Q.want = c.B.id;
  // can't pay for it: if saving up would take longer than `save_patience_seconds` at the current
  // rate (or forever), make more of the missing good first, if that is affordable
  const owe = affordable(S, c.B, town);
  if (owe) {
    const rate = L.supply[owe.good] || 0, wait = rate > 0 ? owe.short / rate : Infinity;
    const maker = wait > T(S).savePatienceSeconds ? known(S, town).find(B => B.seconds && B.output[owe.good]) : undefined;
    if (maker && !affordable(S, maker, town)) c = follow(S, L, { B: maker, sev: c.sev, why: `${runningLow(S, owe.good)} to build ${article(c.B.name)} ${c.B.name}` }, 0);
    else { Q.status = `Saving ${goodName(S, owe.good)} for ${article(c.B.name)} ${c.B.name}: ${c.why}`; return; }
  }

  Q.streak = Q.streak.type === c.B.id ? { type: c.B.id, n: Q.streak.n + 1 } : { type: c.B.id, n: 1 };
  if (Q.streak.n < T(S).confirmCycles) { Q.status = `Thinking about ${article(c.B.name)} ${c.B.name}: ${c.why}`; return; }

  const spot = chooseSpot(S, c.B.id, town);
  if (!spot) { Q.status = `No room for ${article(c.B.name)} ${c.B.name}: ${c.why}`; return; }
  const b = placeBuilding(S, c.B.id, spot.x, spot.y, false)!;
  b.town = town.id;
  b.priority = 1 + Math.round(c.sev * T(S).urgencyPriority);
  b.reason = c.why;
  Q.site = b.id; Q.placed++; Q.streak = { type: '', n: 0 };
  Q.status = `Planning ${article(c.B.name)} ${c.B.name}: ${c.why}`;
  emit(S, 'info', S.towns.length > 1 ? `${town.name}: ${Q.status}` : Q.status);
}
