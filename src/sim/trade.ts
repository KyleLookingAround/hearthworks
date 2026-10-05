import { add, bp, chronicle, emit, villagers } from './world.ts';
import { setOff } from './ships.ts';
import { cancelTask } from './logistics.ts';
import { goToBuilding } from './agents.ts';
import { shareable } from './knowledge.ts';
import type { Agent, ItemId, State, Stock, Town } from './types.ts';

/**
 * Trade between neighbours (Phase 13). A settlement with goods to spare and a want sends a porter: a
 * carrier with a load from its stores walks to the neighbour's storage yard, leaves the load, and brings a
 * load of something wanted back, at a rate set by how badly each side wants what it gets. Porters gossip
 * like visitors. Imports count as supply for the planner, so a settlement stops building what it can
 * reliably trade for. There is no money and no global stockpile: every load is carried.
 */
const X = (S: State) => S.content.tuning.trade;

const stores = (S: State, town: Town) => S.buildings.filter(b => b.town === town.id && !b.site && bp(S, b).storage);

/** Goods free to take from a settlement's stores (what carriers have not already claimed). */
export function stockOf(S: State, town: Town): Stock {
  const out: Stock = {};
  for (const b of stores(S, town)) for (const g in b.inv) { const n = (b.inv[g] || 0) - (b.reserved[g] || 0); if (n > 0) out[g] = (out[g] || 0) + n; }
  return out;
}

/** How badly a settlement wants a good, 0 to 1: its planner's shortage, or stock running under `want_cover` seconds of use. */
export function wantOf(S: State, town: Town, g: ItemId, st = stockOf(S, town)): number {
  // what homes eat goes straight to them, so stores say little about it: only the planner's shortage counts
  const use = homeFoods(S).has(g) ? 0 : town.planner.use[g] || 0, low = use > 0 ? Math.max(0, 1 - (st[g] || 0) / (use * X(S).wantCover)) : 0;
  return Math.max(town.planner.wants[g] || 0, low);
}

/**
 * What a settlement can spare: stock beyond `keep` and `spare_cover` seconds of its own use, of every good
 * it does not want and has not lately traded for (nothing goes straight back). Of its food chain (what homes
 * eat and what goes into it) it keeps twice the cover and a meal per villager besides.
 */
export function spareOf(S: State, town: Town): Stock {
  const out: Stock = {}, st = stockOf(S, town), food = foodChain(S);
  const pop = villagers(S).filter(a => a.home?.town === town.id).length;
  for (const g in st) {
    if (wantOf(S, town, g, st) > 0 || (town.trade.imports[g] || 0) > X(S).load / X(S).smoothingSeconds / 4) continue;
    // the food chain keeps twice the cover, and a meal per villager
    const n = Math.floor(st[g] - X(S).keep - (town.planner.use[g] || 0) * X(S).spareCover * (food.has(g) ? 2 : 1) - (food.has(g) ? pop : 0));
    if (n >= 1) out[g] = n;
  }
  return out;
}

/** The goods homes eat: their bread and the foods of the diet (once per content). */
const foodSets = new WeakMap<object, Set<ItemId>>();
const homeFoods = (S: State) => {
  let out = foodSets.get(S.content);
  if (!out) { out = new Set([...Object.values(S.content.blueprints).filter(B => B.homes).flatMap(B => Object.keys(B.keepStocked)), ...S.content.tuning.farms.diet]); foodSets.set(S.content, out); }
  return out;
};

/** What homes eat and everything that goes into making it. */
function foodChain(S: State): Set<ItemId> {
  const out = new Set(homeFoods(S));
  for (let grew = true; grew;) {
    grew = false;
    for (const B of Object.values(S.content.blueprints)) if (Object.keys(B.output).some(g => out.has(g))) for (const i in B.input) if (!out.has(i)) { out.add(i); grew = true; }
  }
  return out;
}

/** Take up to n of a good out of a settlement's stores; returns how many came. */
function takeFrom(S: State, town: Town, g: ItemId, n: number): number {
  let got = 0;
  for (const b of stores(S, town)) {
    const k = Math.min(n - got, (b.inv[g] || 0) - (b.reserved[g] || 0));
    if (k > 0) { add(b.inv, g, -k); got += k; }
    if (got >= n) break;
  }
  return got;
}

/** Put goods into a settlement's stores: the first with room that keeps them, else its first yard. */
function putIn(S: State, town: Town, g: ItemId, n: number) {
  const room = (b: (typeof S.buildings)[number]) => {
    const B = bp(S, b);
    if (B.keeps && !B.keeps.includes(g)) return 0;
    if (!B.capacity) return Infinity;
    let k = 0; for (const i in b.inv) k += b.inv[i]; for (const i in b.incoming) k += b.incoming[i];
    return B.capacity - k;
  };
  const to = stores(S, town).find(b => room(b) >= n) ?? S.bmap.get(town.store);
  if (to) add(to.inv, g, n);
}

/** A good's worth to a settlement: how badly it wants it, never nothing. */
const worth = (S: State, town: Town, g: ItemId) => Math.max(0.1, wantOf(S, town, g));

/** Once a second: imports fade, and each settlement may send a porter. */
export function updateTrade(S: State, dt: number) {
  if (!S.trade || S.towns.length < 2) return;
  const fade = Math.exp(-dt / X(S).smoothingSeconds);
  for (const town of S.towns) {
    for (const g in town.trade.imports) town.trade.imports[g] *= fade;
    town.trade.t += dt;
    if (town.trade.t >= X(S).everySeconds && sendPorter(S, town)) town.trade.t = 0;
  }
}

/** The best deal a settlement can strike: a want of its own a neighbour can spare, for a spare good that neighbour wants. */
function bestDeal(S: State, town: Town) {
  const home = S.bmap.get(town.store);
  if (!home) return null;
  const mine = spareOf(S, town), st = stockOf(S, town);
  let best: { host: Town; give: ItemId; want: ItemId; score: number } | null = null;
  for (const host of S.towns) {
    const hs = S.bmap.get(host.store);
    if (host === town || !hs) continue;
    const theirs = spareOf(S, host), hst = stockOf(S, host), far = Math.hypot(hs.x - home.x, hs.y - home.y) * X(S).distanceWeight;
    // kin keep trading: a daughter and her mother favour each other
    const kin = host.mother === town.id || town.mother === host.id ? X(S).kinBonus : 0;
    for (const want in theirs) {
      const w = wantOf(S, town, want, st);
      if (!(w > 0)) continue;
      for (const give in mine) {
        // a neighbour takes what it wants, or anything it is not itself unloading, at a poor rate
        const h = wantOf(S, host, give, hst);
        if (!(h > 0) && (theirs[give] || 0) > 0) continue;
        const score = w + h - far + kin;
        if (score > (best?.score ?? 0)) best = { host, give, want, score };
      }
    }
  }
  return best;
}

function sendPorter(S: State, town: Town): boolean {
  const people = villagers(S).filter(a => a.home?.town === town.id);
  const out = people.filter(a => a.visit?.trade && a.visit.from === town.id).length;
  if (people.length < X(S).minVillagers || out >= Math.max(1, Math.floor(people.length / X(S).villagersPerPorter))) return false;
  const deal = bestDeal(S, town);
  if (!deal) return false;
  const carriers = people.filter(a => a.role === 'carrier' && a.state !== 'visit');
  if (carriers.length < 2) return false;
  const a = carriers.find(c => !c.carry && (c.state === 'idle' || c.state === 'wander' || c.state === 'toSrc'));
  if (!a) return false;
  const n = takeFrom(S, town, deal.give, Math.min(X(S).load, spareOf(S, town)[deal.give] || 0));
  if (n < 1) return false;
  cancelTask(a);
  a.visit = { from: town.id, to: deal.host.id, back: false, carry: shareable(town), boat: false, trade: { give: deal.give, want: deal.want } };
  a.carry = { item: deal.give, n };
  a.state = 'visit';
  if (!setOff(S, a, town, () => goToBuilding(S, a, S.bmap.get(deal.host.store)!))) {
    putIn(S, town, deal.give, n);
    a.visit = null; a.carry = null; a.state = 'idle';
    // kept ashore for want of a boat (ships on): the next porter waits for the next round
    if (town.boatless === S.t) town.trade.t = 0;
    return false;
  }
  a.visit.boat = a.path.some(([x, y]) => S.world.ground[y * S.world.w + x] === 0);
  return true;
}

/** A porter reaches the neighbour: leaves the load and takes back what it is worth to both sides. */
export function barter(S: State, a: Agent) {
  const v = a.visit!, from = S.towns[v.from], host = S.towns[v.to], give = a.carry;
  if (!v.trade || !give) return;
  const first = !Object.keys(from.trade.exported).length && !Object.keys(from.trade.imported).length;
  putIn(S, host, give.item, give.n);
  host.trade.imported[give.item] = (host.trade.imported[give.item] || 0) + give.n;
  host.trade.imports[give.item] = (host.trade.imports[give.item] || 0) + give.n / X(S).smoothingSeconds;
  from.trade.exported[give.item] = (from.trade.exported[give.item] || 0) + give.n;
  const rate = Math.max(X(S).minRate, Math.min(X(S).maxRate, worth(S, host, give.item) / worth(S, from, v.trade.want)));
  const back = takeFrom(S, host, v.trade.want, Math.min(Math.round(give.n * rate), spareOf(S, host)[v.trade.want] || 0));
  a.carry = back > 0 ? { item: v.trade.want, n: back } : null;
  S.stats.trades++;
  if (first) chronicle(S, from.id, 'trade', `${from.name} first traded with ${host.name}: ${give.n} ${name(S, give.item)} for ${name(S, v.trade.want)}`);
}

const name = (S: State, g: ItemId) => S.content.goods[g]?.name.toLowerCase() ?? g;

/** A porter home again: the load goes into the stores. */
export function homecoming(S: State, a: Agent) {
  const v = a.visit!, from = S.towns[v.from], host = S.towns[v.to], got = a.carry;
  a.carry = null;
  if (!v.trade || !got) return;
  putIn(S, from, got.item, got.n);
  from.trade.imported[got.item] = (from.trade.imported[got.item] || 0) + got.n;
  from.trade.imports[got.item] = (from.trade.imports[got.item] || 0) + got.n / X(S).smoothingSeconds;
  host.trade.exported[got.item] = (host.trade.exported[got.item] || 0) + got.n;
  emit(S, 'info', `A porter brought ${got.n} ${name(S, got.item)} home to ${from.name} from ${host.name}`, true);
}
