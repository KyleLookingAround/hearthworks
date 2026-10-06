import { rand } from './rng.ts';
import { findPath, type PathOptions } from './path.ts';
import { bp, distAB, door, inB, hypot } from './core.ts';
import { seasonOf, storesOnTrack } from './seasons.ts';
import { tread } from './terrain.ts';
import { blame, cancelTask, drop, findTask, pickup, staleBoard, staleTask } from './logistics.ts';
import { arrive } from './knowledge.ts';
import { explorerArrives, sight } from './sea.ts';
import { rowing } from './ships.ts';
import { enoughInStore, foodChainOf } from './production.ts';
import { capOf, crew, leave, places, unripe } from './farms.ts';
import type { Agent, Building, State } from './types.ts';

export function makeAgent(S: State, kind: Agent['kind'], x: number, y: number): Agent {
  const a: Agent = {
    id: S.nextId++, kind, x, y, path: [], state: 'idle', role: kind === 'bot' ? 'bot' : 'carrier', task: null, carry: null,
    home: null, work: null, depot: null, cool: rand(S.rng) * S.content.tuning.logistics.idleLookSeconds, dead: false, visit: null, born: S.t, dies: 0, skill: {}, schooled: false, name: '', cart: null,
  };
  S.agents.push(a); S.amap.set(a.id, a);
  return a;
}

export function removeAgent(S: State, a: Agent) {
  cancelTask(a);
  if (a.work) leave(a.work, a.id);
  if (a.home) a.home.residents = a.home.residents.filter(id => id !== a.id);
  a.dead = true;
  S.agents = S.agents.filter(o => o !== a); S.amap.delete(a.id);
}

export function moveTo(S: State, a: Agent, tx: number, ty: number, opts?: PathOptions): boolean {
  const sx = Math.floor(a.x), sy = Math.floor(a.y);
  // with ships on, only someone crewing a boat of their settlement's rows
  const p = findPath(S.world, sx, sy, tx, ty, S.ships ? rowing(S, a, opts) : opts);
  if (!p) return false;
  a.path = p;
  // a trip on foot that goes the long way round water is remembered by the villager's settlement, for bridges
  const town = a.kind === 'villager' && a.home ? S.towns[a.home.town] : undefined, straight = hypot(tx - sx, ty - sy), P = S.content.tuning.planner;
  if (town && straight >= P.detourMinTiles && p.length >= P.detourRatio * straight && !p.some(([x, y]) => !S.world.ground[y * S.world.w + x] && !S.world.bridge[y * S.world.w + x]) && waterBetween(S, sx, sy, tx, ty)) {
    town.detours = town.detours.filter(d => S.t - d[5] < P.detourMemorySeconds).slice(-P.detourMemoryTrips);
    town.detours.push([sx, sy, tx, ty, p.length, S.t]);
  }
  return true;
}

/** Is there open water on the straight line between two tiles? */
function waterBetween(S: State, sx: number, sy: number, tx: number, ty: number): boolean {
  const w = S.world, n = Math.ceil(hypot(tx - sx, ty - sy));
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
      const L = S.content.tuning.logistics;
      a.cool = L.idleLookSeconds + rand(S.rng) * L.idleLookJitter;
      // children neither work nor carry: they potter about
      if ((a.role === 'child' || !findTask(S, a)) && a.state === 'idle' && rand(S.rng) < L.wanderChance) wander(S, a);
    }
  }
  if (a.path.length) {
    const L = S.content.tuning.logistics, w = S.world;
    const [tx, ty] = a.path[0], gx = tx + 0.5, gy = ty + 0.5;
    const i = Math.floor(a.y) * w.w + Math.floor(a.x);
    let sp = a.kind === 'bot' ? L.botSpeed : L.villagerSpeed;
    if (!w.ground[i] && !w.bridge[i]) sp = w.sea[i] === 1 ? L.boatSpeed / w.shallowCost : L.boatSpeed;
    else if (w.bridge[i]) sp *= L.pathSpeed;
    else if (w.road[i]) sp *= w.road[i] === 3 ? L.stoneRoadSpeed : w.road[i] === 2 ? L.roadSpeed : L.pathSpeed;
    else if (w.ground[i] === 3) sp /= w.rockCost;
    else if (w.tree[i] === 2 && a.kind !== 'bot') sp *= L.forestSpeed;
    // a handcart rolls best on roads, well on paths and bridges, and drags elsewhere; an ox cart likewise, at an ox's pace
    if (a.cart !== null && (w.ground[i] || w.bridge[i])) {
      const shed = S.bmap.get(a.cart), ox = !!shed && S.content.blueprints[shed.type].oxen > 0;
      sp *= w.road[i] >= 2 ? (ox ? L.oxRoadSpeed : L.cartRoadSpeed) : w.road[i] || w.bridge[i] ? (ox ? L.oxPathSpeed : L.cartPathSpeed) : ox ? L.oxRoughSpeed : L.cartRoughSpeed;
    }
    // slopes slow walkers as much as they cost in route finding
    if (w.ground[i]) sp /= 1 + w.slopeCost * Math.abs(w.height[ty * w.w + tx] - w.height[i]);
    const dx = gx - a.x, dy = gy - a.y, d = hypot(dx, dy), step = sp * dt;
    if (d <= step) {
      a.x = gx; a.y = gy; a.path.shift();
      const j = ty * w.w + tx;
      if (w.ground[j]) tread(w, j);
      else if (S.charts && a.visit && !w.bridge[j]) sight(S, a, tx, ty);
      if (a.task) { a.task.steps++; if (w.road[j] >= 2) a.task.road++; else if (w.road[j] || w.bridge[j]) a.task.path++; }
    } else { a.x += (dx / d) * step; a.y += (dy / d) * step; }
  }
  if (!a.path.length) {
    // goods picked up or dropped, or a visitor arriving, change what the job board holds
    if (a.state === 'toSrc') { staleTask(S, a.task); pickup(S, a); }
    else if (a.state === 'toDst') { staleTask(S, a.task); drop(S, a); }
    else if (a.state === 'toWork') a.state = 'working';
    else if (a.state === 'wander') a.state = 'idle';
    else if (a.state === 'visit') { staleBoard(S); if (a.visit?.explore) explorerArrives(S, a); else arrive(S, a); }
  }
}

/** The carriers a self-planning settlement keeps: `carrier_share` of its grown villagers, at least one. */
export function reserve(S: State, town: number): number {
  let n = 0;
  for (const a of S.agents) if (a.kind === 'villager' && a.role !== 'child' && a.home?.town === town) n++;
  return Math.max(1, Math.ceil(n * S.content.tuning.planner.carrierShare));
}

/** Give each staffed building a worker from its own settlement, keeping one carrier there until it has bots. */
/** Send a building's workers back to carrying. */
export function release(S: State, b: Building) {
  const ids = crew(b);
  b.worker = null; b.hands = [];
  for (const id of ids) { const w = S.amap.get(id); if (w) { w.work = null; w.role = 'carrier'; w.state = 'idle'; w.path = []; } }
}

/** One worker leaves their workplace (its other hands stay) and goes back to carrying. */
export function quit(a: Agent) {
  if (a.work) leave(a.work, a.id);
  a.work = null; a.role = 'carrier'; a.state = 'idle'; a.path = [];
}

export function assignWorkers(S: State) {
  const essential = foodChainOf(S), winter = seasonOf(S) === 'winter', behind: Record<number, boolean> = {}, backlog: Record<number, boolean> = {};
  // hands go first where the planner is shortest: open workplaces by how badly their settlement wants what they make
  const want = (b: Building) => { const w = S.towns[b.town]?.planner.wants; return w ? Math.max(0, ...Object.keys(bp(S, b).output).map(g => w[g] || 0)) : 0; };
  const order = S.buildings.map(b => ({ b, w: bp(S, b).workers && !b.site && !b.worker ? want(b) : 0 })).sort((p, q) => q.w - p.w).map(o => o.b);
  for (const b of order) {
    if (!bp(S, b).workers || b.site || b.worker) continue;
    staff(b);
  }
  // then a second hand and more where a grown workplace has places for them, again where wanted most
  const more = S.buildings.filter(b => b.worker !== null && !b.site && places(S, b) > 1 + b.hands.length).map(b => ({ b, w: want(b) })).sort((p, q) => q.w - p.w).map(o => o.b);
  for (const b of more) if (b.worker !== null && places(S, b) > 1 + b.hands.length) staff(b);

  function staff(b: Building) {
    // nobody is sent to a workplace resting with enough in store
    if (enoughInStore(S, b)) return;
    // fields resting through winter need nobody, nor young trees not bearing yet
    if (winter && bp(S, b).seasonal) return;
    if (unripe(S, b)) return;
    if (b.noWay !== null && S.t - b.noWay < S.content.tuning.logistics.noWayRetrySeconds) return;
    // nobody is sent to a workplace whose output stands full: it waits for carriers, and its worker was one
    if (Object.keys(bp(S, b).output).some(k => (b.inv[k] || 0) >= capOf(S, b))) return;
    const anyBots = S.agents.some(a => a.kind === 'bot' && a.depot?.town === b.town);
    const carriers = S.agents.filter(a => a.kind === 'villager' && a.role === 'carrier' && a.state !== 'visit' && a.home?.town === b.town);
    if (carriers.length <= (anyBots ? 0 : 1)) return;
    // while goods stand waiting at full workplaces, a self-planning settlement keeps its planner's share of grown
    // hands carrying, unless it goes hungry and this workplace feeds it
    const town = S.towns[b.town];
    if (town?.planner.on && (backlog[b.town] ??= S.buildings.some(o => o.town === b.town && !o.site && Object.keys(bp(S, o).output).some(k => (o.inv[k] || 0) >= capOf(S, o))))
      && !(town.fed < 1 && Object.keys(bp(S, b).output).some(g => essential.has(g))) && carriers.length <= reserve(S, b.town)) return;
    // someone who has just found they cannot get anywhere waits out that long cool-down (idle carriers
    // otherwise only pause under a second between looks for work)
    // (with people on, the old have retired from workplaces)
    const idle = carriers.filter(a => !a.task && a.cool <= 1 && !(S.people && S.t - a.born >= S.content.tuning.people.elderSeconds));
    // a hungry settlement takes a worker off a workplace outside the food chain to staff one in it
    // (and so does one whose winter store has fallen behind, or with people on, one short of what this workplace makes)
    if (!idle.length && S.towns[b.town] && (S.towns[b.town].fed < 1 || (behind[b.town] ??= !storesOnTrack(S, S.towns[b.town])) || (S.people && Object.keys(bp(S, b).output).some(g => (S.towns[b.town].planner.wants[g] || 0) > 0))) && Object.keys(bp(S, b).output).some(g => essential.has(g))) {
      // the worker whose trade its settlement wants least
      let spare: Agent | undefined, sw = Infinity;
      for (const a of S.agents) if (a.role === 'worker' && a.work && a.home?.town === b.town && !Object.keys(bp(S, a.work).output).some(g => essential.has(g))) { const w = want(a.work); if (w < sw) { sw = w; spare = a; } }
      if (spare) { leave(spare.work!, spare.id); spare.work = null; spare.role = 'carrier'; spare.state = 'idle'; spare.path = []; idle.push(spare); }
    }
    // with people on, a carrier much more skilled at this work than anyone idle is called back from an errand
    // (only on the way to pick up, so nothing carried is lost)
    if (S.people) {
      const best = Math.max(0, ...idle.map(a => a.skill[b.type] || 0));
      const skilled = carriers.filter(a => a.task && a.state === 'toSrc' && !(S.t - a.born >= S.content.tuning.people.elderSeconds) && (a.skill[b.type] || 0) >= best + S.content.tuning.people.recallSkill)
        .sort((p, q) => (q.skill[b.type] || 0) - (p.skill[b.type] || 0))[0];
      if (skilled) { cancelTask(skilled); idle.unshift(skilled); }
    }
    if (!idle.length) return;
    // the nearest, or with people on the most skilled at this work (then the nearest)
    let pick = idle[0], pd = Infinity;
    for (const a of idle) { const d = distAB(a, b) - (S.people ? (a.skill[b.type] || 0) * 1e4 : 0); if (d < pd) { pd = d; pick = a; } }
    pick.path = []; pick.role = 'worker'; pick.work = b; if (b.worker === null) b.worker = pick.id; else b.hands.push(pick.id); pick.state = 'toWork';
    // already at the door, or nobody could walk there: they don't work it from afar
    if (!goToBuilding(S, pick, b)) {
      const d = door(b);
      if (Math.floor(pick.x) === d.x && Math.floor(pick.y) === d.y) pick.state = 'working';
      else { leave(b, pick.id); pick.work = null; pick.role = 'carrier'; pick.state = 'idle'; blame(S, pick, b); }
    }
  }
}
