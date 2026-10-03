/**
 * The job board. Buildings post requests (a site wants planks, a sawmill
 * wants logs, a house wants bread) and offers (output buffers, storage).
 * An idle carrier claims the cheapest request/offer pair and reserves the
 * goods at both ends, so two carriers never fetch the same stack.
 */
import { add, bp, ctr, distAB, distBB } from './world.ts';
import { goToBuilding } from './agents.ts';
import type { Agent, Building, ItemId, State } from './types.ts';

export interface Request { dst: Building; item: ItemId; need: number; pri: number }

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

export function collectRequests(S: State): Request[] {
  const reqs: Request[] = [];
  siteRequests(S, reqs);
  for (const b of S.buildings) {
    const B = bp(S, b);
    if (b.site) continue;
    if (b.paused) continue;
    for (const item in B.keepStocked) {
      const need = B.keepStocked[item] - (b.inv[item] || 0) - (b.incoming[item] || 0);
      const age = aged(S, b, item, need);
      if (need > 0) reqs.push({ dst: b, item, need, pri: (B.homes ? -4 : 0) - age });
    }
  }
  return reqs;
}

export function findTask(S: State, a: Agent): boolean {
  const L = S.content.tuning.logistics;
  const cap = a.kind === 'bot' ? L.botCarry : L.villagerCarry;
  const dep = a.depot, depR = dep ? bp(S, dep).couriers!.radius : 0;
  // villagers work for their own settlement; trade between settlements is a later phase
  const town = a.kind === 'villager' ? a.home?.town ?? null : null;
  const inRange = (b: Building) => {
    if (town !== null && b.town !== town) return false;
    if (!dep) return true;
    const p = ctr(dep), q = ctr(b);
    return (p.x - q.x) ** 2 + (p.y - q.y) ** 2 <= depR * depR;
  };
  let best: { src: Building; dst: Building; item: ItemId; n: number } | null = null, bestScore = Infinity;

  // offers indexed by good, in building order, so only real source/request pairs are scored
  const reqs = collectRequests(S).filter(r => inRange(r.dst));
  const offers = new Map<ItemId, { b: Building; av: number }[]>();
  for (const r of reqs) if (!offers.has(r.item)) offers.set(r.item, []);
  for (const s of S.buildings) {
    if (!inRange(s)) continue;
    for (const [item, list] of offers) { const av = available(S, s, item); if (av > 0) list.push({ b: s, av }); }
  }
  for (const r of reqs) {
    for (const { b: s, av } of offers.get(r.item)!) {
      if (s === r.dst) continue;
      S.world.work.jobPairs++;
      const score = distAB(a, s) + distBB(s, r.dst) + r.pri + (bp(S, s).storage ? 2 : 0);
      if (score < bestScore) { bestScore = score; best = { src: s, dst: r.dst, item: r.item, n: Math.min(cap, r.need, av) }; }
    }
  }
  // surplus goes to the nearest storage yard so producers don't stall
  const stores = S.buildings.filter(b => bp(S, b).storage && !b.site && inRange(b));
  if (stores.length) for (const s of S.buildings) {
    if (s.site) continue;
    for (const item in bp(S, s).output) {
      const av = available(S, s, item);
      if (av < L.dumpAt || !inRange(s)) continue;
      let st = stores[0], sd = Infinity;
      for (const d of stores) { const dd = distBB(s, d); if (dd < sd) { sd = dd; st = d; } }
      const score = distAB(a, s) + sd + 12;
      if (score < bestScore) { bestScore = score; best = { src: s, dst: st, item, n: Math.min(cap, av) }; }
    }
  }
  if (!best) return false;
  add(best.src.reserved, best.item, best.n);
  add(best.dst.incoming, best.item, best.n);
  a.task = best; a.state = 'toSrc';
  if (!goToBuilding(S, a, best.src)) {
    add(best.src.reserved, best.item, -best.n); add(best.dst.incoming, best.item, -best.n);
    a.task = null; a.state = 'idle';
    return false;
  }
  return true;
}

export function pickup(S: State, a: Agent) {
  const t = a.task;
  if (!t) { a.state = 'idle'; return; }
  if (t.src.dead) { cancelTask(a); return; }
  const have = t.src.inv[t.item] || 0, take = Math.min(t.n, have);
  t.src.inv[t.item] = have - take;
  add(t.src.reserved, t.item, -t.n);
  if (take < t.n) { if (!t.dst.dead) add(t.dst.incoming, t.item, -(t.n - take)); t.n = take; }
  if (!take) { a.task = null; a.state = 'idle'; return; }
  a.carry = { item: t.item, n: take }; a.state = 'toDst';
  if (t.dst.dead || !goToBuilding(S, a, t.dst)) {
    if (!t.dst.dead) add(t.dst.incoming, t.item, -t.n);
    a.task = null; a.carry = null; a.state = 'idle';
  }
}

export function drop(S: State, a: Agent) {
  const t = a.task;
  if (t && !t.dst.dead) {
    add(t.dst.inv, t.item, t.n); add(t.dst.incoming, t.item, -t.n);
    S.stats.deliveries[a.kind]++;
  }
  a.task = null; a.carry = null; a.state = 'idle'; a.cool = 0;
}

/** Drop the current job and release its reservations. Carried goods are lost. */
export function cancelTask(a: Agent) {
  const t = a.task;
  if (t) {
    if (a.state === 'toSrc' && !t.src.dead) add(t.src.reserved, t.item, -t.n);
    if (!t.dst.dead) add(t.dst.incoming, t.item, -t.n);
  }
  a.task = null; a.carry = null; a.path = [];
  if (a.role !== 'worker') a.state = 'idle';
}
