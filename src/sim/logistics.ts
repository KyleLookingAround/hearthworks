/**
 * The job board. Buildings post requests (a site wants planks, a sawmill
 * wants logs, a house wants bread) and offers (output buffers, storage).
 * An idle carrier claims the cheapest request/offer pair and reserves the
 * goods at both ends, so two carriers never fetch the same stack.
 */
import { add, bp, ctr, distAB, distBB, door, seasonOf } from './world.ts';
import { findPath } from './path.ts';
import { goToBuilding } from './agents.ts';
import { wants } from './production.ts';
import type { Agent, Building, ItemId, State, Task } from './types.ts';

export interface Request { dst: Building; item: ItemId; need: number; pri: number; /** not worth a trip of its own: only topped up on a cart's round */ topUp?: boolean }

export function available(S: State, b: Building, item: ItemId): number {
  if (b.site || b.dead) return 0;
  const B = bp(S, b);
  if (B.storage || item in B.output) return (b.inv[item] || 0) - (b.reserved[item] || 0);
  return 0;
}

/** Goods on offer, not yet claimed by a carrier: in one settlement, or anywhere if none is given. */
export function supplyOf(S: State, item: ItemId, town?: number): number {
  let n = 0;
  for (const b of S.buildings) if (town === undefined || b.town === town) n += Math.max(0, available(S, b, item));
  return n;
}

/**
 * Construction sites queue for materials: highest priority first, then oldest.
 * Each site is promised its outstanding need from the free supply in turn, and
 * only requests what is left after every site ahead of it, so an expensive site
 * cannot soak up the planks a more urgent one is waiting for. Carriers also treat
 * a site as `site_priority_tiles` nearer per priority level.
 */
/**
 * How long a request has gone unserved. Carriers treat a waiting request as `request_aging`
 * tiles nearer per second, so a far request is never starved forever by short surplus runs.
 */
function aged(S: State, b: Building, item: ItemId, need: number): number {
  if (need <= 0 || (b.incoming[item] || 0) > 0) { delete b.waiting[item]; return 0; }
  if (!(item in b.waiting)) b.waiting[item] = S.t;
  return (S.t - b.waiting[item]) * S.content.tuning.logistics.requestAging;
}

function siteRequests(S: State, reqs: Request[]) {
  const per = S.content.tuning.production.sitePriorityTiles;
  const sites = S.buildings.filter(b => b.site).sort((a, b) => b.priority - a.priority || a.id - b.id);
  const left: Record<ItemId, number> = {};
  for (const b of sites) {
    const B = bp(S, b);
    for (const item in B.cost) {
      const need = B.cost[item] - (b.inv[item] || 0) - (b.incoming[item] || 0);
      const age = aged(S, b, item, need);
      if (need <= 0) continue;
      // each settlement promises its own supply: villagers only haul within their settlement
      const key = `${b.town}:${item}`;
      if (!(key in left)) left[key] = supplyOf(S, item, b.town);
      const n = Math.min(need, left[key]);
      left[key] -= need;
      if (n > 0) reqs.push({ dst: b, item, need: n, pri: -b.priority * per - age });
    }
  }
}

/** What a blueprint's requests and offers turn on, worked out once per blueprint: the job board asks it of every building on every call. */
interface Shape { food: ItemId | undefined; outputs: ItemId[]; offers: boolean }
const shapes = new WeakMap<object, Shape>();
function shapeOf(B: ReturnType<typeof bp>): Shape {
  let out = shapes.get(B);
  if (!out) { const outputs = Object.keys(B.output); out = { food: Object.keys(B.keepStocked)[0], outputs, offers: B.storage || outputs.length > 0 }; shapes.set(B, out); }
  return out;
}

/** The foods homes keep, once per content. */
const homeFoods = new WeakMap<object, Set<ItemId>>();
function homeFoodOf(S: State): Set<ItemId> {
  let out = homeFoods.get(S.content);
  if (!out) {
    out = new Set<ItemId>();
    for (const id in S.content.blueprints) for (const g of Object.keys(S.content.blueprints[id].keepStocked)) if (S.content.blueprints[id].homes) out.add(g);
    homeFoods.set(S.content, out);
  }
  return out;
}

export function collectRequests(S: State): Request[] {
  const reqs: Request[] = [];
  siteRequests(S, reqs);
  const ask = asker(S);
  for (const b of S.buildings) ask(b, reqs);
  return reqs;
}

/** What one standing building asks for, pushed onto `reqs`: the same for the whole tick until its stock, its goods on the way or its wants change. */
function asker(S: State): (b: Building, reqs: Request[]) => void {
  const winter = seasonOf(S) === 'winter', homeFood = winter ? homeFoodOf(S) : null, L = S.content.tuning.logistics;
  let yards: Building[] | null = null;
  const farFromStores = (b: Building) => (yards ??= S.buildings.filter(o => bp(S, o).storage && !o.site)).every(o => o.town !== b.town || distBB(o, b) >= L.cartMinTiles);
  const preserved = S.content.tuning.seasons.preserved, diet = S.farms ? S.content.tuning.farms.diet : null;
  return (b, reqs) => {
    if (b.site) return;
    if (b.paused) return;
    const B = bp(S, b), shape = shapeOf(B);
    const want = wants(S, b, S.towns[b.town]?.form ?? 'hamlet'), food = shape.food;
    // in winter a bakery's grain comes as soon as a home's bread: the stores are all there is
    const kitchen = !!homeFood && shape.outputs.some(g => homeFood.has(g));
    for (const item in want) {
      const need = want[item] - (b.inv[item] || 0) - (b.incoming[item] || 0);
      // a home far from every storage yard asks for its food once it is worth a pair of hands, or it has run out: not a loaf
      // at a time across town (near a yard, a loaf at a time keeps a small village fed)
      // (a cart passing on its round tops it up all the same)
      if (B.homes && item === food && need < Math.min(L.villagerCarry, want[item]) && (b.inv[item] || 0) + (b.incoming[item] || 0) > 0 && farFromStores(b)) { delete b.waiting[item]; if (need > 0) reqs.push({ dst: b, item, need, pri: 0, topUp: true }); continue; }
      const age = aged(S, b, item, need);
      // a home's food comes first, then firewood and preserved food, then its comforts
      // (with farms that grow, the foods of the diet come with the preserved food)
      if (need > 0) reqs.push({ dst: b, item, need, pri: (B.homes ? (item === food ? -4 : item === 'logs' || preserved.includes(item) || (diet !== null && diet.includes(item)) ? -3 : 2) : kitchen ? -4 : 0) - age });
    }
  };
}

/** How many more of a good a store takes: none if it does not keep that kind, else the room left (no limit: plenty). */
export function roomFor(S: State, st: Building, item: ItemId): number {
  const B = bp(S, st);
  if (B.keeps && !B.keeps.includes(item)) return 0;
  if (!B.capacity) return Infinity;
  let n = 0;
  for (const k in st.inv) n += st.inv[k];
  for (const k in st.incoming) n += st.incoming[k];
  return Math.max(0, B.capacity - n);
}

/**
 * The nearest cart shed (or, with `ox`, ox barn with feed in stock) of the carrier's settlement within `cart_reach`
 * with a cart not already out.
 */
function freeCart(S: State, a: Agent, town: number | null, ox = false): Building | null {
  const L = S.content.tuning.logistics;
  let best: Building | null = null, bd = Infinity;
  for (const b of S.buildings) {
    const B = bp(S, b), n = ox ? B.oxen : B.carts;
    if (!n || b.site || b.town !== town) continue;
    const d = distAB(a, b);
    if (d > L.cartReach || d >= bd) continue;
    if (ox && Object.keys(B.keepStocked).some(g => (b.inv[g] || 0) < L.oxFeed)) continue;
    let out = 0;
    for (const o of S.agents) if (o.cart === b.id) out++;
    if (out < n) { best = b; bd = d; }
  }
  return best;
}

/**
 * While the agents take their turns in a tick, the board is open: one carrier after another looks
 * for work, and the requests are the same until something changes them (a job claimed, goods picked
 * up or dropped, a visitor arriving), so they are gathered again only then. Outside that pass, every
 * look gathers them afresh.
 */
let open: State | null = null, board: Board | null = null;
/**
 * The board of the tick: every request, and each standing building's own. After a job is claimed or goods are picked
 * up or dropped, only the buildings it touched ask again (with the sites, whose queue turns on every settlement's
 * supply); the rest ask what they asked a moment ago, as nothing they ask by has changed.
 */
interface Board {
  S: State; t: number; reqs: Request[] | null; touched: Set<Building> | null;
  /** the requests last gathered, and where each building's own lie among them (`from` to `to`, by its place in `bs`) */
  last: Request[]; bs: Building[]; n: number; from: Int32Array; to: Int32Array;
  /** when each settlement's buildings were last touched (by the count of `stamps`); a carrier of none counts every touch */
  dirty: Map<number | null, number>;
}
let stamps = 0;
/** Off, every look gathers the requests afresh: the tests check the board changes nothing but the time it takes. */
export const jobBoard = { reuse: true };
export function openBoard(S: State) { open = jobBoard.reuse ? S : null; board = null; looks.clear(); }
export function closeBoard() { open = null; board = null; looks.clear(); }
/**
 * Something the requests turn on changed: gather them again at the next look. Given the buildings whose stock or
 * goods on the way changed, only they (and the sites) ask again; given none, everyone does.
 */
export function staleBoard(...touched: (Building | null | undefined)[]) {
  if (!board) return;
  if (!touched.length) { board = null; return; }
  board.reqs = null;
  board.touched ??= new Set();
  for (const b of touched) if (b) { board.touched.add(b); board.dirty.set(b.town, ++stamps); board.dirty.set(null, stamps); }
}
/** A carrier's job is about to change things at these buildings: its source, its drop and the rest of its round. */
export const staleTask = (t: Task | null) => { if (t) staleBoard(t.src, t.dst, ...t.round.map(r => r.dst)); else staleBoard(); };

/**
 * The buildings of each settlement that can offer goods (storage yards and workplaces), in building order, gathered
 * again whenever buildings come or go or time moves on: a carrier of one settlement looks over its own only, as it
 * would find nothing in range elsewhere; a carrier of none over every settlement's.
 */
let owned: { S: State; all: Building[]; n: number; t: number; by: Map<number | null, Building[]> } | null = null;
function offerersOf(S: State, town: number | null): Building[] {
  if (!owned || owned.S !== S || owned.all !== S.buildings || owned.n !== S.buildings.length || owned.t !== S.t) {
    const by = new Map<number | null, Building[]>([[null, []]]);
    for (const b of S.buildings) {
      if (!shapeOf(bp(S, b)).offers) continue;
      let l = by.get(b.town);
      if (!l) by.set(b.town, l = []);
      l.push(b); by.get(null)!.push(b);
    }
    owned = { S, all: S.buildings, n: S.buildings.length, t: S.t, by };
  }
  return owned.by.get(town) ?? [];
}

/** The requests of one settlement's buildings, in board order, sorted out once for each gathering of the board (all of them for none). */
const asked = new WeakMap<Request[], Map<number, Request[]>>();
function askedOf(all: Request[], town: number | null): Request[] {
  if (town === null) return all;
  let by = asked.get(all);
  if (!by) {
    by = new Map();
    for (const r of all) { let l = by.get(r.dst.town); if (!l) by.set(r.dst.town, l = []); l.push(r); }
    asked.set(all, by);
  }
  return by.get(town) ?? [];
}

export function requestsNow(S: State): Request[] {
  if (open !== S) return collectRequests(S);
  if (board && board.S === S && board.t === S.t) {
    if (board.reqs) return board.reqs;
    // (the same buildings in the same order: only the touched ones ask again)
    if (board.touched && board.bs === S.buildings && board.n === S.buildings.length) {
      const { last, bs, n, from, to, touched } = board, reqs: Request[] = [], ask = asker(S), nf = new Int32Array(n), nt = new Int32Array(n);
      siteRequests(S, reqs);
      for (let i = 0; i < n; i++) {
        nf[i] = reqs.length;
        if (touched.has(bs[i])) ask(bs[i], reqs);
        else for (let k = from[i]; k < to[i]; k++) reqs.push(last[k]);
        nt[i] = reqs.length;
      }
      board.reqs = board.last = reqs; board.from = nf; board.to = nt; board.touched = null;
      return reqs;
    }
  }
  const reqs: Request[] = [], ask = asker(S), bs = S.buildings, n = bs.length, from = new Int32Array(n), to = new Int32Array(n);
  siteRequests(S, reqs);
  for (let i = 0; i < n; i++) { from[i] = reqs.length; ask(bs[i], reqs); to[i] = reqs.length; }
  board = { S, t: S.t, reqs, touched: null, last: reqs, bs, n, from, to, dirty: new Map() };
  return reqs;
}

/** What a carrier sees on the board: the requests in range, the offers of each good asked for, and the surplus to clear. */
interface Seen {
  reqs: Request[];
  /** each request (not a cart's top-up) with each offer of its good from elsewhere (in building order, with the storage yard's penalty) */
  pairs: { r: Request; o: { b: Building; av: number; extra: number } }[];
  stores: Building[];
  /** surplus enough to clear, in building order, and (once first weighed) the nearest storage yard with room for it */
  dumps: { s: Building; item: ItemId; av: number; st?: Building | null; sd: number }[];
}
/**
 * Each settlement's look, while the board stands and none of its buildings has been touched since: another settlement's
 * job changes nothing it asks for or offers (its carriers haul at home), and its requests ask the same again.
 */
const looks = new Map<number | null, { board: Board; at: number; seen: Seen }>();

/** Look over the board: `mine` are the buildings in reach that can offer goods. */
function lookOver(S: State, all: Request[], mine: Building[], inRange: (b: Building) => boolean): Seen {
  const L = S.content.tuning.logistics;
  // offers indexed by good, in building order, so only real source/request pairs are scored
  const reqs = all.filter(r => inRange(r.dst));
  const offers = new Map<ItemId, { b: Building; av: number; extra: number }[]>();
  for (const r of reqs) if (!offers.has(r.item)) offers.set(r.item, []);
  // (only storage and workshops offer anything: homes and sites are passed over whole)
  if (offers.size) for (const s of mine) {
    if (s.site || s.dead || !inRange(s)) continue;
    // (what it has of the goods asked for, as `available` counts it: a storage yard anything it holds, a workplace what it makes)
    const B = bp(S, s), extra = B.storage ? 2 : 0;
    for (const item of B.storage ? Object.keys(s.inv) : shapeOf(B).outputs) {
      const list = offers.get(item);
      if (!list) continue;
      const av = (s.inv[item] || 0) - (s.reserved[item] || 0);
      if (av > 0) list.push({ b: s, av, extra });
    }
  }
  const stores = mine.filter(b => bp(S, b).storage && !b.site && inRange(b)), dumps: Seen['dumps'] = [];
  if (stores.length) for (const s of mine) {
    if (s.site) continue;
    for (const item in bp(S, s).output) {
      const av = available(S, s, item);
      if (av < L.dumpAt || !inRange(s)) continue;
      dumps.push({ s, item, av, sd: Infinity });
    }
  }
  // every request with each offer of its good, in turn
  const pairs: Seen['pairs'] = [];
  for (const r of reqs) if (!r.topUp) for (const o of offers.get(r.item)!) if (o.b !== r.dst) pairs.push({ r, o });
  return { reqs, pairs, stores, dumps };
}

/** The nearest storage yard to a surplus that keeps its kind and has room left. */
function nearestRoom(S: State, d: Seen['dumps'][number], stores: Building[]) {
  let st: Building | null = null, sd = Infinity;
  for (const o of stores) { if (o === d.s || roomFor(S, o, d.item) <= 0) continue; const dd = distBB(d.s, o); if (dd < sd) { sd = dd; st = o; } }
  d.st = st; d.sd = sd;
}

export function findTask(S: State, a: Agent): boolean {
  const L = S.content.tuning.logistics;
  const cap = a.kind === 'bot' ? L.botCarry : L.villagerCarry;
  const dep = a.depot, depR = dep ? bp(S, dep).couriers!.radius : 0, p = dep ? ctr(dep) : null;
  // villagers work for their own settlement; trade between settlements is a later phase
  const town = a.kind === 'villager' ? a.home?.town ?? null : null;
  const inRange = (b: Building) => {
    if (town !== null && b.town !== town) return false;
    if (b.noWay !== null && S.t - b.noWay < L.noWayRetrySeconds) return false;
    if (!p) return true;
    // (the centre of `b`, as ctr gives it)
    const qx = b.x + b.w / 2, qy = b.y + b.h / 2;
    return (p.x - qx) ** 2 + (p.y - qy) ** 2 <= depR * depR;
  };
  let best: { src: Building; dst: Building; item: ItemId; n: number } | null = null, bestScore = Infinity;
  // a cart shed near the carrier with a cart free: long jobs take a cart and a bigger load
  // and for the longest jobs an ox cart, from a barn with an ox free and feed for it
  // (looked for only once a job is in sight: most calls find none)
  let shed: Building | null | undefined, barn: Building | null | undefined;
  const shedOf = () => (shed === undefined ? (shed = a.kind === 'villager' && S.carts ? freeCart(S, a, town) : null) : shed);
  const barnOf = () => (barn === undefined ? (barn = a.kind === 'villager' && S.carts ? freeCart(S, a, town, true) : null) : barn);
  const vehicleFor = (tiles: number) => (barnOf() && tiles >= L.oxMinTiles ? barnOf() : shedOf() && tiles >= L.cartMinTiles ? shedOf() : null);
  const loadFor = (v: Building | null) => (!v ? cap : bp(S, v).oxen ? L.oxCarry : L.cartCarry);
  const capFor = (tiles: number) => loadFor(vehicleFor(tiles));

  const all = requestsNow(S);
  // what is asked and offered in range: the same for every carrier of a settlement without a depot, until the board changes there
  const held = !p && open === S && board ? looks.get(town) : undefined;
  let seen = held && held.board === board && (board!.dirty.get(town) ?? -1) <= held.at ? held.seen : undefined;
  if (!seen) {
    seen = lookOver(S, askedOf(all, town), offerersOf(S, town), inRange);
    if (!p && open === S && board) looks.set(town, { board, at: stamps, seen });
  }
  const { reqs, pairs, dumps } = seen;
  for (const { r, o: { b: s, av, extra } } of pairs) {
    S.world.work.jobPairs++;
    const da = distAB(a, s);
    // the walk to the source alone already scores no better: the pair cannot win (scores only grow with distance)
    if (da + r.pri + extra >= bestScore) continue;
    const tiles = da + distBB(s, r.dst), score = tiles + r.pri + extra;
    if (score < bestScore) { bestScore = score; best = { src: s, dst: r.dst, item: r.item, n: Math.min(capFor(tiles), r.need, av) }; }
  }
  // surplus goes to the nearest storage yard so producers don't stall
  for (const d of dumps) {
    const da = distAB(a, d.s);
    // the walk to the source alone already scores no better: no storage yard can win it
    if (da + 12 >= bestScore) continue;
    if (d.st === undefined) nearestRoom(S, d, seen.stores);
    if (!d.st) continue;
    const score = da + d.sd + 12;
    if (score < bestScore) { bestScore = score; best = { src: d.s, dst: d.st, item: d.item, n: Math.min(capFor(da + d.sd), d.av) }; }
  }
  if (!best) return false;
  // a job is taken (or, if no way to it is found, taken and let go): the requests change
  staleBoard(best.src, best.dst);
  const tiles = distAB(a, best.src) + distBB(best.src, best.dst);
  let cart = vehicleFor(tiles), load = loadFor(cart);
  // a cart on a long haul fills up: the same good for others asking within `round_tiles` of the first drop, in turn
  const round: { dst: Building; n: number }[] = [];
  // and a workshop's input comes a cartload at a time, beyond its usual shelf
  if (cart && !best.dst.site && bp(S, best.dst).input[best.item]) best.n = Math.max(best.n, Math.min(load, available(S, best.src, best.item)));
  let total = best.n;
  if (cart && total < load) {
    const first = best, near = reqs.filter(r => r.item === first.item && r.dst !== first.dst && r.dst !== first.src && distBB(r.dst, first.dst) <= L.roundTiles)
      .sort((p, q) => distBB(p.dst, first.dst) - distBB(q.dst, first.dst) || p.dst.id - q.dst.id);
    let av = available(S, best.src, best.item) - total;
    for (const r of near) {
      const k = Math.min(r.need, load - total, av);
      if (k <= 0) continue;
      round.push({ dst: r.dst, n: k }); total += k; av -= k;
      if (total >= load) break;
    }
  }
  // an ox cart is slower than a handcart: only a load a handcart cannot take is worth the ox
  if (cart && bp(S, cart).oxen && total <= L.cartCarry && shedOf()) cart = shedOf()!;
  staleBoard(cart, ...round.map(r => r.dst));
  add(best.src.reserved, best.item, total);
  add(best.dst.incoming, best.item, best.n);
  for (const r of round) add(r.dst.incoming, best.item, r.n);
  a.task = { ...best, at: S.t, tiles, steps: 0, road: 0, path: 0, round }; a.state = 'toSrc';
  // only a load bigger than two hands can carry is worth the cart; an ox eats its feed as it sets out
  if (cart && total > cap) {
    a.cart = cart.id;
    const C = bp(S, cart);
    if (C.oxen) { for (const g in C.keepStocked) cart.inv[g] -= L.oxFeed; S.stats.oxTrips++; }
  }
  if (!goToBuilding(S, a, best.src)) {
    blame(S, a, best.src);
    cancelTask(a);
    return false;
  }
  return true;
}

/** Everything a task still carries or will pick up: the first drop and the rest of its round. */
const loadOf = (t: Task) => t.n + t.round.reduce((s, r) => s + r.n, 0);

/**
 * Nobody found a way to `b`. If its own settlement's storage cannot reach its door either, the building has
 * no way in and is left alone for a while; otherwise the carrier is the one cut off, and waits instead.
 */
export function blame(S: State, a: Agent, b: Building) {
  const store = S.bmap.get(S.towns[b.town]?.store ?? -1), d = door(b);
  const from = store ? door(store) : null;
  // (nobody blames the storage yard itself: everyone else walks from it, so the one who failed is the one cut off)
  if (!from || (store !== b && !findPath(S.world, from.x, from.y, d.x, d.y))) b.noWay = S.t;
  else a.cool = S.content.tuning.logistics.noWayRetrySeconds;
}

export function pickup(S: State, a: Agent) {
  const t = a.task;
  if (!t) { a.state = 'idle'; return; }
  if (t.src.dead) { cancelTask(a); return; }
  const want = loadOf(t), have = t.src.inv[t.item] || 0, take = Math.min(want, have);
  t.src.inv[t.item] = have - take;
  add(t.src.reserved, t.item, -want);
  // less there than claimed: the last drops of the round go without first
  let short = want - take;
  while (short > 0 && t.round.length) {
    const r = t.round[t.round.length - 1], k = Math.min(short, r.n);
    if (!r.dst.dead) add(r.dst.incoming, t.item, -k);
    r.n -= k; short -= k;
    if (!r.n) t.round.pop();
  }
  if (short > 0) { if (!t.dst.dead) add(t.dst.incoming, t.item, -short); t.n -= short; }
  if (!take) { a.task = null; a.state = 'idle'; a.cart = null; return; }
  a.carry = { item: t.item, n: take }; a.state = 'toDst';
  if (t.dst.dead || !goToBuilding(S, a, t.dst)) {
    if (!t.dst.dead) blame(S, a, t.dst);
    cancelTask(a); a.state = 'idle';
  }
}

export function drop(S: State, a: Agent) {
  const t = a.task;
  if (t && !t.dst.dead) {
    add(t.dst.inv, t.item, t.n); add(t.dst.incoming, t.item, -t.n);
    S.stats.deliveries[a.kind]++;
    S.stats.deliverySeconds += S.t - t.at; S.stats.delivered++; S.stats.deliveryTiles += t.tiles;
    S.stats.goodsDelivered += t.n;
    if (a.cart !== null) S.stats.cartDeliveries++;
    const ox = a.cart !== null && !!S.bmap.get(a.cart) && bp(S, S.bmap.get(a.cart)!).oxen > 0;
    if (t.tiles >= S.content.tuning.logistics.cartMinTiles && a.kind === 'villager') {
      S.stats.longDeliveries++; S.stats.longGoods += t.n;
      if (a.cart !== null) { S.stats.longByCart++; S.stats.longGoodsByCart += t.n; S.stats.longCartSeconds += S.t - t.at; if (ox) { S.stats.longGoodsByOx += t.n; S.stats.longOxSeconds += S.t - t.at; } } else S.stats.longFootSeconds += S.t - t.at;
    }
    // deliveries mostly along roads, and mostly along paths: their time and straight-line tiles
    if (t.steps && t.road * 2 >= t.steps) { S.stats.roadDeliveries++; S.stats.roadDeliverySeconds += S.t - t.at; S.stats.roadDeliveryTiles += t.tiles; }
    else if (t.steps && t.path * 2 >= t.steps) { S.stats.pathDeliveries++; S.stats.pathDeliverySeconds += S.t - t.at; S.stats.pathDeliveryTiles += t.tiles; }
    // how far the settlement's deliveries go, smoothed: the strain of distance
    const town = S.towns[t.dst.town];
    if (town && a.kind === 'villager') town.reach += (t.tiles - town.reach) / S.content.tuning.knowledge.reachSmoothing;
  }
  // a cart's round goes on to its next drop
  if (t && a.carry) {
    a.carry.n -= t.dst.dead ? 0 : t.n;
    while (t.round.length) {
      const next = t.round.shift()!;
      if (next.dst.dead) continue;
      t.tiles += distBB(t.dst, next.dst); t.dst = next.dst; t.n = next.n;
      if (goToBuilding(S, a, t.dst)) return;
      add(t.dst.incoming, t.item, -t.n);
    }
  }
  a.task = null; a.carry = null; a.state = 'idle'; a.cool = 0; a.cart = null;
}

/** Does a carrier's job take from or bring to this building, on any drop of its round? */
export const touches = (a: Agent, b: Building) => !!a.task && (a.task.src === b || a.task.dst === b || a.task.round.some(r => r.dst === b));

/** Drop the current job and release its reservations. Carried goods are lost. */
export function cancelTask(a: Agent) {
  const t = a.task;
  if (t) {
    if (a.state === 'toSrc' && !t.src.dead) add(t.src.reserved, t.item, -loadOf(t));
    if (!t.dst.dead) add(t.dst.incoming, t.item, -t.n);
    for (const r of t.round) if (!r.dst.dead) add(r.dst.incoming, t.item, -r.n);
  }
  a.task = null; a.carry = null; a.path = []; a.cart = null;
  if (a.role !== 'worker') a.state = 'idle';
}
