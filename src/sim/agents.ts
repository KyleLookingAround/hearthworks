import { rand } from './rng.ts';
import { findPath, type PathOptions } from './path.ts';
import { bp, distAB, door, inB } from './world.ts';
import { blame, cancelTask, drop, findTask, pickup } from './logistics.ts';
import { arrive } from './knowledge.ts';
import type { Agent, Building, State } from './types.ts';

export function makeAgent(S: State, kind: Agent['kind'], x: number, y: number): Agent {
  const a: Agent = {
    id: S.nextId++, kind, x, y, path: [], state: 'idle', role: kind === 'bot' ? 'bot' : 'carrier', task: null, carry: null,
    home: null, work: null, depot: null, cool: rand(S.rng) * 0.5, dead: false, visit: null,
  };
  S.agents.push(a); S.amap.set(a.id, a);
  return a;
}

export function removeAgent(S: State, a: Agent) {
  cancelTask(a);
  if (a.work && a.work.worker === a.id) a.work.worker = null;
  if (a.home) a.home.residents = a.home.residents.filter(id => id !== a.id);
  a.dead = true;
  S.agents = S.agents.filter(o => o !== a); S.amap.delete(a.id);
}

export function moveTo(S: State, a: Agent, tx: number, ty: number, opts?: PathOptions): boolean {
  const sx = Math.floor(a.x), sy = Math.floor(a.y);
  const p = findPath(S.world, sx, sy, tx, ty, opts);
  if (!p) return false;
  a.path = p;
  // a trip on foot that goes the long way round water is remembered by the villager's settlement, for bridges
  const town = a.kind === 'villager' && a.home ? S.towns[a.home.town] : undefined, straight = Math.hypot(tx - sx, ty - sy);
  if (town && straight >= 6 && p.length >= S.content.tuning.planner.detourRatio * straight && !p.some(([x, y]) => !S.world.ground[y * S.world.w + x] && !S.world.bridge[y * S.world.w + x]) && waterBetween(S, sx, sy, tx, ty)) {
    town.detours = town.detours.filter(d => S.t - d[5] < 300).slice(-15);
    town.detours.push([sx, sy, tx, ty, p.length, S.t]);
  }
  return true;
}

/** Is there open water on the straight line between two tiles? */
function waterBetween(S: State, sx: number, sy: number, tx: number, ty: number): boolean {
  const w = S.world, n = Math.ceil(Math.hypot(tx - sx, ty - sy));
  for (let k = 1; k < n; k++) {
    const x = Math.round(sx + ((tx - sx) * k) / n), y = Math.round(sy + ((ty - sy) * k) / n), i = y * w.w + x;
    if (!w.ground[i] && !w.bridge[i]) return true;
  }
  return false;
}

export const goToBuilding = (S: State, a: Agent, b: Building, opts?: PathOptions) => { const d = door(b); return moveTo(S, a, d.x, d.y, opts); };

export function nearestStore(S: State, at: { x: number; y: number }): Building | null {
  let best: Building | null = null, bd = Infinity;
  for (const b of S.buildings) if (bp(S, b).storage && !b.site) { const d = distAB(at, b); if (d < bd) { bd = d; best = b; } }
  return best;
}

function wander(S: State, a: Agent) {
  const anchor = a.kind === 'bot' ? a.depot : (nearestStore(S, a) || a.home);
  if (!anchor) return;
  const w = S.world;
  const tx = anchor.x - 2 + Math.floor(rand(S.rng) * (anchor.w + 4)), ty = anchor.y + anchor.h + Math.floor(rand(S.rng) * 3);
  if (inB(w, tx, ty) && w.ground[ty * w.w + tx] && w.bgrid[ty * w.w + tx] === -1 && moveTo(S, a, tx, ty)) a.state = 'wander';
}

export function updateAgent(S: State, a: Agent, dt: number) {
  if (a.state === 'idle' || a.state === 'wander') {
    a.cool -= dt;
    if (a.cool <= 0) {
      a.cool = 0.5 + rand(S.rng) * 0.4;
      if (!findTask(S, a) && a.state === 'idle' && rand(S.rng) < 0.3) wander(S, a);
    }
  }
  if (a.path.length) {
    const L = S.content.tuning.logistics, w = S.world;
    const [tx, ty] = a.path[0], gx = tx + 0.5, gy = ty + 0.5;
    const i = Math.floor(a.y) * w.w + Math.floor(a.x);
    let sp = a.kind === 'bot' ? L.botSpeed : L.villagerSpeed;
    if (!w.ground[i] && !w.bridge[i]) sp = L.boatSpeed;
    else if (w.bridge[i]) sp *= L.roadSpeed;
    else if (w.road[i]) sp *= L.roadSpeed;
    else if (w.ground[i] === 3) sp /= w.rockCost;
    else if (w.tree[i] === 2 && a.kind !== 'bot') sp *= L.forestSpeed;
    // slopes slow walkers as much as they cost in route finding
    if (w.ground[i]) sp /= 1 + w.slopeCost * Math.abs(w.height[ty * w.w + tx] - w.height[i]);
    const dx = gx - a.x, dy = gy - a.y, d = Math.hypot(dx, dy), step = sp * dt;
    if (d <= step) { a.x = gx; a.y = gy; a.path.shift(); if (w.ground[ty * w.w + tx]) w.wear[ty * w.w + tx] += 1; } else { a.x += (dx / d) * step; a.y += (dy / d) * step; }
  }
  if (!a.path.length) {
    if (a.state === 'toSrc') pickup(S, a);
    else if (a.state === 'toDst') drop(S, a);
    else if (a.state === 'toWork') a.state = 'working';
    else if (a.state === 'wander') a.state = 'idle';
    else if (a.state === 'visit') arrive(S, a);
  }
}

/** Give each staffed building a worker from its own settlement, keeping one carrier there until it has bots. */
export function assignWorkers(S: State) {
  for (const b of S.buildings) {
    if (!bp(S, b).workers || b.site || b.worker) continue;
    if (b.noWay !== null && S.t - b.noWay < S.content.tuning.logistics.noWayRetrySeconds) continue;
    const anyBots = S.agents.some(a => a.kind === 'bot' && a.depot?.town === b.town);
    const carriers = S.agents.filter(a => a.kind === 'villager' && a.role === 'carrier' && a.state !== 'visit' && a.home?.town === b.town);
    if (carriers.length <= (anyBots ? 0 : 1)) continue;
    // someone who has just found they cannot get anywhere waits out that long cool-down (idle carriers
    // otherwise only pause under a second between looks for work)
    const idle = carriers.filter(a => !a.task && a.cool <= 1);
    if (!idle.length) continue;
    let pick = idle[0], pd = Infinity;
    for (const a of idle) { const d = distAB(a, b); if (d < pd) { pd = d; pick = a; } }
    pick.path = []; pick.role = 'worker'; pick.work = b; b.worker = pick.id; pick.state = 'toWork';
    // already at the door, or nobody could walk there: they don't work it from afar
    if (!goToBuilding(S, pick, b)) {
      const d = door(b);
      if (Math.floor(pick.x) === d.x && Math.floor(pick.y) === d.y) pick.state = 'working';
      else { b.worker = null; pick.work = null; pick.role = 'carrier'; pick.state = 'idle'; blame(S, pick, b); }
    }
  }
}
