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

export function collectRequests(S: State): Request[] {
  const reqs: Request[] = [];
  for (const b of S.buildings) {
    const B = bp(S, b);
    if (b.site) {
      for (const item in B.cost) {
        const need = B.cost[item] - (b.inv[item] || 0) - (b.incoming[item] || 0);
        if (need > 0) reqs.push({ dst: b, item, need, pri: 0 });
      }
      continue;
    }
    if (b.paused) continue;
    for (const item in B.keepStocked) {
      const need = B.keepStocked[item] - (b.inv[item] || 0) - (b.incoming[item] || 0);
      if (need > 0) reqs.push({ dst: b, item, need, pri: B.homes ? -4 : 0 });
    }
  }
  return reqs;
}

export function findTask(S: State, a: Agent): boolean {
  const L = S.content.tuning.logistics;
  const cap = a.kind === 'bot' ? L.botCarry : L.villagerCarry;
  const dep = a.depot, depR = dep ? bp(S, dep).couriers!.radius : 0;
  const inRange = (b: Building) => {
    if (!dep) return true;
    const p = ctr(dep), q = ctr(b);
    return (p.x - q.x) ** 2 + (p.y - q.y) ** 2 <= depR * depR;
  };
  let best: { src: Building; dst: Building; item: ItemId; n: number } | null = null, bestScore = Infinity;

  for (const r of collectRequests(S)) {
    if (!inRange(r.dst)) continue;
    for (const s of S.buildings) {
      if (s === r.dst) continue;
      const av = available(S, s, r.item);
      if (av <= 0 || !inRange(s)) continue;
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
