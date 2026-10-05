import { goToBuilding } from './agents.ts';
import { cancelTask } from './logistics.ts';
import { add, bp, chronicle, clearSite, emit, foundTown, neighbourSite, seasonOf, storesOnTrack, villagers } from './world.ts';
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
  if (pop.length < Z(S).minVillagers || S.towns.length >= Z(S).maxSettlements) return null;
  // a site the party can reach, on foot or by boat from a dock; with none, but land across the water, a crowded
  // settlement feels the need to cross it (and so comes up with the dock and builds one) before it is ready to send anyone
  const site = neighbourSite(S, mother, true);
  if (!site) {
    if (neighbourSite(S, mother, false)) mother.cut = 1;
    return null;
  }
  // nobody sets out from a hungry settlement, and with seasons on parties travel in spring and summer, as newcomers do,
  // while the winter store keeps pace (the party takes a share of it)
  const season = seasonOf(S);
  if (mother.fed < 1 || (S.seasons && (season === 'autumn' || season === 'winter' || !storesOnTrack(S, mother)))) return null;
  // the founding cost may be gathered from the whole settlement (bread seldom rests in a yard, nor logs beside a busy sawmill);
  // the share of the rest comes from the stores
  const have = stock(S, mother), cost = foundingCost(S), round = stock(S, mother, true);
  if (Object.keys(cost).some(k => (round[k] || 0) < cost[k])) return null;
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
  clearSite(S, S.content.maps[S.setup.map], site.x, site.y);
  const d = foundTown(S, site.x, site.y, true, mother.planner.roads, party);
  const yard = S.bmap.get(d.store)!;
  // the yard and cottages are what they carried for them; the rest goes into the yard
  const rest: Stock = { ...carried };
  for (const id of ['storage', 'house', 'house']) for (const k in S.content.blueprints[id].cost) add(rest, k, -S.content.blueprints[id].cost[k]);
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
  d.mother = mother.id;
  d.levers = { priority: { ...mother.levers.priority }, encourage: null, pace: mother.levers.pace };
  d.laws = { ...mother.laws };
  mother.sentAt = S.t;
  for (const a of party) { a.path = []; a.state = 'idle'; goToBuilding(S, a, yard); }
  // across the water: a colony
  const W = S.world, overseas = party.some(a => a.path.some(([x, y]) => !W.ground[y * W.w + x] && !W.bridge[y * W.w + x]));
  d.overseas = overseas;
  chronicle(S, mother.id, 'settled', `${mother.name} sent ${party.length} settlers ${overseas ? 'across the sea' : 'off'} to found ${d.name}`);
  chronicle(S, d.id, 'founded', `${d.name} was founded by ${party.length} settlers from ${mother.name}`);
  emit(S, 'good', `Settlers from ${mother.name} founded ${d.name}`);
  return d;
}
