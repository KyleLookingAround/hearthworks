import { rand } from './rng.ts';
import { findPath } from './path.ts';
import { bp, distAB, door, inB } from './world.ts';
import { cancelTask, drop, findTask, pickup } from './logistics.ts';
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

export function moveTo(S: State, a: Agent, tx: number, ty: number): boolean {
  const p = findPath(S.world, Math.floor(a.x), Math.floor(a.y), tx, ty);
  if (!p) return false;
  a.path = p;
  return true;
}

export const goToBuilding = (S: State, a: Agent, b: Building) => { const d = door(b); return moveTo(S, a, d.x, d.y); };

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
    if (w.road[i]) sp *= L.roadSpeed;
    else if (w.tree[i] === 2 && a.kind !== 'bot') sp *= L.forestSpeed;
    const dx = gx - a.x, dy = gy - a.y, d = Math.hypot(dx, dy), step = sp * dt;
    if (d <= step) { a.x = gx; a.y = gy; a.path.shift(); } else { a.x += (dx / d) * step; a.y += (dy / d) * step; }
  }
  if (!a.path.length) {
    if (a.state === 'toSrc') pickup(S, a);
    else if (a.state === 'toDst') drop(S, a);
    else if (a.state === 'toWork') a.state = 'working';
    else if (a.state === 'wander') a.state = 'idle';
    else if (a.state === 'visit') arrive(S, a);
  }
}

/** Give each staffed building a worker, keeping at least one carrier until bots arrive. */
export function assignWorkers(S: State) {
  const anyBots = S.agents.some(a => a.kind === 'bot');
  for (const b of S.buildings) {
    if (!bp(S, b).workers || b.site || b.worker) continue;
    const carriers = S.agents.filter(a => a.kind === 'villager' && a.role === 'carrier' && a.state !== 'visit');
    if (carriers.length <= (anyBots ? 0 : 1)) return;
    const idle = carriers.filter(a => !a.task && a.state !== 'visit');
    if (!idle.length) return;
    let pick = idle[0], pd = Infinity;
    for (const a of idle) { const d = distAB(a, b); if (d < pd) { pd = d; pick = a; } }
    pick.path = []; pick.role = 'worker'; pick.work = b; b.worker = pick.id; pick.state = 'toWork';
    if (!goToBuilding(S, pick, b)) pick.state = 'working';
  }
}
