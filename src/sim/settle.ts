import { goToBuilding } from './agents.ts';
import { cancelTask } from './logistics.ts';
import { add, bp, chronicle, door, emit, villagers } from './core.ts';
import { clearSite, neighbourSite } from './worldgen.ts';
import { foundTown } from './towns.ts';
import { seasonOf, storesOnTrack } from './seasons.ts';
import { reachable } from './path.ts';
import { embark, launch, partyDock } from './ships.ts';
import type { Agent, State, Stock, Town } from './types.ts';

/**
 * Settling (Phase 17): a crowded settlement sends a founding party off to found a daughter town, with
 * villagers, a share of its stores, the knowledge it has proven and its custom. See design/systems/settling.md.
 */
const Z = (S: State) => S.content.tuning.settling;

/** Once a second: each self-planning settlement looks, every `check_every_seconds`, at whether to send a party. */
export function updateSettling(S: State, dt: number) {
  if (!S.settlers) return;
  for (const t of [...S.towns]) {
    t.settleT += dt;
    if (t.settleT < Z(S).checkEverySeconds) continue;
    t.settleT = 0;
    if (t.planner.on && S.t - t.sentAt >= Z(S).cooldownSeconds) sendParty(S, t);
  }
}

/**
 * The food a founding party needs to see it to its first harvest (with seasons on): its meals for `first_harvest_seconds`
 * of growing season after it lands, through the winter first if that is less than is left before the frost, with
 * `provision_headroom`. Without seasons, none beyond its share of the stores.
 */
export function provisions(S: State): number {
  if (!S.seasons) return 0;
  const Y = S.content.tuning.seasons.yearSeconds, into = S.t % Y, frost = 0.75 * Y;
  const wait = frost - into >= Z(S).firstHarvestSeconds ? Z(S).firstHarvestSeconds : Y - into + Z(S).firstHarvestSeconds;
  return (Z(S).partySize * wait / S.content.tuning.needs.eatEverySeconds) * Z(S).provisionHeadroom;
}

/** What a new yard and two cottages cost, and the stores a new game starts with. */
function foundingCost(S: State): Stock {
  const out: Stock = { ...S.content.tuning.start.storage };
  for (const [id, n] of [['storage', 1], ['house', 2]] as const) for (const k in S.content.blueprints[id].cost) add(out, k, S.content.blueprints[id].cost[k] * n);
  return out;
}

/** Goods in a settlement's stores; with `all`, in every finished building of it (homes' shelves, workshops' stocks). */
function stock(S: State, t: Town, all = false): Stock {
  const out: Stock = {};
  for (const b of S.buildings) if (b.town === t.id && !b.site && (all || bp(S, b).storage)) for (const k in b.inv) add(out, k, (b.inv[k] || 0) - (b.reserved[k] || 0));
  return out;
}

/** Take goods out of a settlement's stores, first yard first, then from its other buildings (bread from homes' shelves, logs from a sawmill's pile). */
function take(S: State, t: Town, g: string, n: number): number {
  let got = 0;
  for (const pass of [true, false]) for (const b of S.buildings) {
    if (got >= n) return got;
    if (b.town !== t.id || b.site || !!bp(S, b).storage !== pass) continue;
    const k = Math.min(n - got, (b.inv[g] || 0) - (b.reserved[g] || 0));
    if (k > 0) { add(b.inv, g, -k); got += k; }
  }
  return got;
}

export function sendParty(S: State, mother: Town): Town | null {
  const pop = villagers(S).filter(a => a.home?.town === mother.id);
  // crowded: `min_villagers`, or `crowded_min_villagers` once its planner finds no room for what it needs (its land is full)
  const full = /^No room/.test(mother.planner.status);
  if (pop.length < (full ? Z(S).crowdedMinVillagers : Z(S).minVillagers) || S.towns.length >= Z(S).maxSettlements) return null;
  // a site the party can reach, on foot or by boat from a dock; with none, but land across the water, a crowded
  // settlement feels the need to cross it (and so comes up with the dock and builds one) before it is ready to send anyone
  // (with charts on, only on charted land: a settlement that knows of none, but has not charted every island,
  // wants to know what lies over the sea, so it comes up with the dock and sends an explorer out from it)
  const site = neighbourSite(S, mother, true, S.charts);
  if (!site) {
    if (neighbourSite(S, mother, false, S.charts)) mother.cut = 1;
    else if (S.charts && neighbourSite(S, mother, false)) { mother.cut = 1; mother.explore = true; }
    return null;
  }
  // nobody sets out from a hungry settlement, and with seasons on parties travel in spring and summer, as newcomers do,
  // while the winter store keeps pace (the party takes a share of it)
  const season = seasonOf(S);
  if (mother.fed < 1 || (S.seasons && (season === 'autumn' || season === 'winter' || !storesOnTrack(S, mother)))) return null;
  // the founding cost may be gathered from the whole settlement (bread seldom rests in a yard, nor logs beside a busy sawmill);
  // the share of the rest comes from the stores
  const have = stock(S, mother), cost = foundingCost(S), round = stock(S, mother, true);
  // with ships on, a party bound over the water builds a boat of its own at its settlement's dock, from planks it takes
  const yard0 = S.bmap.get(mother.store), y0 = yard0 ? door(yard0) : null;
  const dock = S.ships && y0 ? partyDock(S, mother, site, reachable(S.world, y0.x, y0.y)) : undefined;
  if (dock === null) return null;
  const boatPlanks = dock ? S.content.tuning.sea.partyBoatPlanks : 0;
  if (boatPlanks) add(cost, 'planks', boatPlanks);
  if (Object.keys(cost).some(k => (round[k] || 0) < cost[k])) return null;
  // with seasons on, the party takes provisions to see it to its first harvest: its own share of the stores, and as
  // much more food as it needs, if its mother can spare that and still keep pace with its own winter
  const food = S.seasons ? ['bread', ...S.content.tuning.seasons.preserved, 'wheat'] : [];
  const share = (k: string) => (cost[k] || 0) + Math.max(0, Math.floor(((have[k] || 0) - (cost[k] || 0)) * Z(S).storesShare));
  const carriedFood = food.reduce((n, k) => n + share(k), 0), costFood = food.reduce((n, k) => n + (cost[k] || 0), 0);
  const extra = Math.max(0, Math.ceil(provisions(S) - carriedFood));
  if (S.seasons && (food.reduce((n, k) => n + (have[k] || 0), 0) - (carriedFood - costFood) < extra || !storesOnTrack(S, mother, -Z(S).partySize, carriedFood + extra))) return null;
  // the party: villagers not at a workplace or on an errand away, adults if people are on
  const P = S.content.tuning.people;
  const free = pop.filter(a => a.role === 'carrier' && !a.visit && !a.carry && (!S.people || (S.t - a.born >= P.adultSeconds && S.t - a.born < P.elderSeconds)));
  if (free.length < Z(S).partySize) return null;
  const party: Agent[] = free.slice(0, Z(S).partySize);
  for (const a of party) cancelTask(a);
  // what they carry: the cost of their first buildings and a share of every good in store
  const carried: Stock = {};
  for (const k in cost) add(carried, k, take(S, mother, k, cost[k]));
  for (const k in have) { const n = Math.floor(((have[k] || 0) - (cost[k] || 0)) * Z(S).storesShare); if (n > 0) add(carried, k, take(S, mother, k, n)); }
  // and the rest of their provisions, bread first
  for (let k = 0, left = extra; k < food.length && left > 0; k++) { const got = take(S, mother, food[k], left); add(carried, food[k], got); left -= got; }
  clearSite(S, S.content.maps[S.setup.map], site.x, site.y);
  const d = foundTown(S, site.x, site.y, true, mother.planner.roads, party);
  const yard = S.bmap.get(d.store)!;
  // the yard and cottages are what they carried for them; the rest goes into the yard
  const rest: Stock = { ...carried };
  for (const id of ['storage', 'house', 'house']) for (const k in S.content.blueprints[id].cost) add(rest, k, -S.content.blueprints[id].cost[k]);
  // (and their boat, if they built one)
  if (boatPlanks) add(rest, 'planks', -boatPlanks);
  const boat = dock ? launch(S, dock, true) : null;
  yard.inv = {};
  for (const k in rest) if (rest[k] > 0) yard.inv[k] = rest[k];
  // knowledge: what the founders knew, and everything the mother has proven in use; its custom
  d.knows = {};
  for (const id in mother.knows) {
    const k = mother.knows[id];
    if (k.by === 'founders' || k.verified.some(v => v.by === mother.name)) d.knows[id] = { ...k, verified: k.verified.map(v => ({ ...v })), from: k.by === 'founders' ? null : mother.name, learned: S.t, used: S.t };
  }
  if (S.towns.some(o => o !== d && o.name === d.name)) d.name = `New ${d.name}`;
  d.custom = mother.custom;
  d.feasts = [...mother.feasts];
  d.naming = mother.naming;
  d.charted = [...mother.charted];
  d.mother = mother.id;
  d.levers = { priority: { ...mother.levers.priority }, encourage: null, pace: mother.levers.pace };
  d.laws = { ...mother.laws };
  mother.sentAt = S.t;
  if (boat) boat.crew = party.map(a => a.id);
  for (const a of party) { a.path = []; a.state = 'idle'; goToBuilding(S, a, yard); }
  if (boat) embark(S, boat, party, d);
  // across the water: a colony
  const W = S.world, overseas = party.some(a => a.path.some(([x, y]) => !W.ground[y * W.w + x] && !W.bridge[y * W.w + x]));
  d.overseas = overseas;
  chronicle(S, mother.id, 'settled', `${mother.name} sent ${party.length} settlers ${overseas ? 'across the sea' : 'off'} to found ${d.name}`);
  chronicle(S, d.id, 'founded', `${d.name} was founded by ${party.length} settlers from ${mother.name}`);
  emit(S, 'good', `Settlers from ${mother.name} founded ${d.name}`);
  return d;
}
