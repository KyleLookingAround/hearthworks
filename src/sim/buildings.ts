import { goToBuilding, makeAgent, moveTo, removeAgent } from './agents.ts';
import { beside, bp, dims, door, emit, front, inB, nearestTown } from './core.ts';
import { paveLevel, pave, unpave } from './terrain.ts';
import { joinFields } from './farms.ts';
import { setBelt, turned } from './belts.ts';
import { reshaped } from './path.ts';
import { launch } from './ships.ts';
import { loseVillager } from './lifecycle.ts';
import type { Building, State } from './types.ts';

/**
 * Why `type` cannot go here, or null if it can. Every tile must be open land, the building
 * must not cover another building's door front, and its own door front must be open land too.
 */
export function placeProblem(S: State, type: string, x: number, y: number, rot = 0): string | null {
  const B = S.content.blueprints[type], w = S.world;
  if (!B) return 'unknown building';
  const { w: bw, h: bh } = B.paves ? { w: 1, h: 1 } : dims(B, rot);
  for (let j = y; j < y + bh; j++) for (let k = x; k < x + bw; k++) {
    if (!inB(w, k, j)) return 'off the edge of the map';
    const i = j * w.w + k;
    if (!w.ground[i]) return 'that is water';
    if (w.ground[i] === 3) return 'that is bare rock';
    if (w.bgrid[i] !== -1) return 'something is already built there';
    // a road can be laid over a path, but nothing over a road
    if (B.belt) { if (w.belt[i]) return 'there is a conveyor already'; continue; }
    if (B.paves) { if (w.road[i] && !(B.road && w.road[i] < paveLevel(B))) return `there is a ${w.road[i] >= 2 ? 'road' : 'path'} already`; continue; }
    if (w.belt[i]) return 'a conveyor runs there';
    if (w.front[i]) return "it would block another building's door";
  }
  if (!B.paves) {
    const at = { x, y, w: bw, h: bh, rot }, f = front(at), fi = f.y * w.w + f.x;
    if (B.shore) {
      // boats launch from the door onto water; people reach the door from open land beside it
      if (!inB(w, f.x, f.y) || w.ground[fi] !== 0) return 'a dock has to open onto water';
      const s = beside(at), si = s.y * w.w + s.x;
      if (!inB(w, s.x, s.y) || !w.ground[si] || w.bgrid[si] !== -1 || w.front[si]) return 'a dock needs open land beside its door';
    }
    else if (!inB(w, f.x, f.y) || !w.ground[fi] || w.bgrid[fi] !== -1) return 'its door would open onto nothing';
  }
  return null;
}

export const canPlace = (S: State, type: string, x: number, y: number, rot = 0) => placeProblem(S, type, x, y, rot) === null;

/**
 * Anyone standing where a new building goes steps out to its door front, and anyone whose
 * route crosses it finds a new one.
 */
function stepOut(S: State, b: Building) {
  const d = door(b), inFoot = (x: number, y: number) => x >= b.x && y >= b.y && x < b.x + b.w && y < b.y + b.h;
  for (const a of S.agents) {
    const inside = inFoot(Math.floor(a.x), Math.floor(a.y));
    if (!inside && !a.path.some(([x, y]) => inFoot(x, y) && !(x === d.x && y === d.y))) continue;
    if (inside) { const f = front(b); a.x = f.x + 0.5; a.y = f.y + 0.5; }
    a.path = [];
    const t = a.task, to = a.state === 'toSrc' ? t?.src : a.state === 'toDst' ? t?.dst : a.state === 'toWork' ? a.work : a.state === 'visit' && a.visit ? S.bmap.get(S.towns[a.visit.back ? a.visit.from : a.visit.to].store) : null;
    // an explorer on the way out rows on for the shore they set out for (or, finding no way, turns for home)
    if (a.state === 'visit' && a.visit?.explore && !a.visit.back) moveTo(S, a, a.visit.explore[0], a.visit.explore[1]);
    else if (to && !to.dead) goToBuilding(S, a, to);
    else if (a.state === 'wander') a.state = 'idle';
  }
}

/** Mark or clear a building's door and the open tile in front of it (beside it, for a dock), and a dock's launching place. */
function setDoor(S: State, b: Building, on: boolean) {
  const w = S.world, d = door(b), i = d.y * w.w + d.x, o = bp(S, b).shore ? beside(b) : front(b), f = inB(w, o.x, o.y) ? o.y * w.w + o.x : -1;
  w.door[i] = on ? 1 : 0;
  if (bp(S, b).shore) { w.dock[i] = on ? b.town + 1 : 0; w.docks += on ? 1 : -1; }
  if (f >= 0 && f < w.front.length) w.front[f] = Math.max(0, w.front[f] + (on ? 1 : -1));
  // a new dock opens the water to rowers
  if (on && bp(S, b).shore) reshaped(w);
}

/** Place a building (or a road tile). New buildings start as construction sites unless `complete`. */
/**
 * Lift a building off the map for a moment, as if it were gone (its tiles, door and place in the lists), and return
 * a function that puts it back exactly: for asking where something could go if this building came down.
 */
export function lift(S: State, b: Building): () => void {
  const w = S.world, at = S.buildings.indexOf(b);
  for (let j = b.y; j < b.y + b.h; j++) for (let k = b.x; k < b.x + b.w; k++) w.bgrid[j * w.w + k] = -1;
  reshaped(w);
  setDoor(S, b, false);
  S.buildings.splice(at, 1); S.bmap.delete(b.id);
  return () => {
    for (let j = b.y; j < b.y + b.h; j++) for (let k = b.x; k < b.x + b.w; k++) w.bgrid[j * w.w + k] = b.id;
    setDoor(S, b, true);
    S.buildings.splice(at, 0, b); S.bmap.set(b.id, b);
  };
}

/**
 * Turn a building a quarter about its centre (`by` 1 from south to west, 3 to turn back), if its turned footprint and
 * door fit there; returns whether it turned. Anyone inside steps out of its new door; routes through it are found again.
 */
export function turnBuilding(S: State, b: Building, by = 1): boolean {
  const B = bp(S, b), w = S.world;
  if (B.bridge || B.paves || b.dead) return false;
  // a farm that has grown fields (or is laying them) no longer turns
  if (b.size > 0 || B.field || S.buildings.some(o => o.of === b.id)) return false;
  // about its centre, rounding toward its corner so that turning back undoes it exactly
  const rot = (b.rot + by) % 4, d = dims(B, rot), x = b.x + Math.trunc((b.w - d.w) / 2), y = b.y + Math.trunc((b.h - d.h) / 2);
  const back = lift(S, b), ok = canPlace(S, b.type, x, y, rot);
  back();
  if (!ok) return false;
  for (let j = b.y; j < b.y + b.h; j++) for (let k = b.x; k < b.x + b.w; k++) w.bgrid[j * w.w + k] = -1;
  reshaped(w);
  setDoor(S, b, false);
  b.x = x; b.y = y; b.w = d.w; b.h = d.h; b.rot = rot;
  turned(S);
  for (let j = y; j < y + d.h; j++) for (let k = x; k < x + d.w; k++) { const i = j * w.w + k; w.bgrid[i] = b.id; w.tree[i] = 0; unpave(w, i); }
  setDoor(S, b, true);
  stepOut(S, b);
  return true;
}

export function placeBuilding(S: State, type: string, x: number, y: number, complete: boolean, rot = 0, size?: { w: number; h: number }): Building | null {
  const B = S.content.blueprints[type], w = S.world;
  if (B.belt) { const i = y * w.w + x; setBelt(w, i, true); w.tree[i] = 0; return null; }
  if (B.paves) { const i = y * w.w + x; pave(w, i, paveLevel(B)); w.tree[i] = 0; return null; }
  // (new fields take the size of the strip they are laid on)
  const { w: bw, h: bh } = size ?? dims(B, rot);
  const b: Building = {
    id: S.nextId++, type, x, y, w: bw, h: bh, rot, site: !complete, build: 0, inv: {}, incoming: {}, reserved: {},
    worker: null, hands: [], timer: 0, plantT: 0, paused: false, status: { t: '', l: 'ok' }, residents: [], eat: 0, hunger: 0, bots: [], dead: false, priority: 0, reason: '', town: nearestTown(S, x + bw / 2, y + bh / 2), used: 0, waiting: {}, noWay: null, doorAt: null, extra: 0, wear: 0, fire: 0, stall: 0, burn: 0, flood: 0, sick: 0, size: 0, of: null, made: 0, ate: {}, idle: 0, replaces: null,
  };
  for (let j = y; j < y + bh; j++) for (let k = x; k < x + bw; k++) { const i = j * w.w + k; w.bgrid[i] = b.id; w.tree[i] = 0; unpave(w, i); }
  setDoor(S, b, true);
  S.buildings.push(b); S.bmap.set(b.id, b);
  stepOut(S, b);
  if (complete) completeSite(S, b, false);
  return b;
}

/**
 * A bridge over the water tiles x..x+w-1, y..y+h-1 (one row or one column), its door on the near bank
 * `from` and the far bank `to`. Both banks are kept open like door fronts. Starts as a construction site.
 */
export function placeBridge(S: State, x: number, y: number, w: number, h: number, from: { x: number; y: number }, to: { x: number; y: number }, town: number): Building {
  const W = S.world;
  const b: Building = {
    id: S.nextId++, type: 'bridge', x, y, w, h, site: true, build: 0, inv: {}, incoming: {}, reserved: {},
    worker: null, hands: [], timer: 0, plantT: 0, paused: false, status: { t: '', l: 'ok' }, residents: [], eat: 0, hunger: 0, bots: [], dead: false, priority: 0, reason: '', town, used: 0, waiting: {}, noWay: null, doorAt: { ...from }, rot: 0, extra: 0, wear: 0, fire: 0, stall: 0, burn: 0, flood: 0, sick: 0, size: 0, of: null, made: 0, ate: {}, idle: 0, replaces: null,
  };
  for (let j = y; j < y + h; j++) for (let k = x; k < x + w; k++) W.bgrid[j * W.w + k] = b.id;
  for (const p of [from, to]) W.front[p.y * W.w + p.x]++;
  S.buildings.push(b); S.bmap.set(b.id, b);
  return b;
}

/** The far bank of a bridge: one step beyond the end of its span opposite its door. */
function farBank(b: Building) {
  const d = door(b);
  if (b.h === 1) return d.x < b.x ? { x: b.x + b.w, y: b.y } : { x: b.x - 1, y: b.y };
  return d.y < b.y ? { x: b.x, y: b.y + b.h } : { x: b.x, y: b.y - 1 };
}

export function completeSite(S: State, b: Building, announce: boolean) {
  b.site = false; b.build = 0; b.inv = {}; b.incoming = {}; b.reserved = {}; b.waiting = {};
  const B = bp(S, b);
  // new fields join their farm and are gone
  if (B.field) {
    setDoor(S, b, false);
    b.dead = true; S.buildings = S.buildings.filter(o => o !== b); S.bmap.delete(b.id);
    joinFields(S, b, b.of !== null ? S.bmap.get(b.of) : undefined, announce);
    return;
  }
  if (B.bridge) {
    for (let j = b.y; j < b.y + b.h; j++) for (let k = b.x; k < b.x + b.w; k++) S.world.bridge[j * S.world.w + k] = 1;
    reshaped(S.world);
    // the long ways round it remembered were measured before this bridge stood
    if (S.towns[b.town]) S.towns[b.town].detours = [];
  }
  // a dock launches its own settlement's boats (whose it is is settled once it stands), and with ships on comes with one
  if (B.shore) { const d = door(b), i = d.y * S.world.w + d.x; if (S.world.dock[i]) { S.world.dock[i] = b.town + 1; reshaped(S.world); } }
  if (B.shore && S.ships) for (let k = 0; k < S.content.tuning.sea.dockBoats; k++) launch(S, b);
  if (B.couriers) {
    const d = door(b);
    for (let k = 0; k < B.couriers.count; k++) {
      const a = makeAgent(S, 'bot', d.x + 0.5 + (k - 1) * 0.3, d.y + 0.5);
      a.depot = b; b.bots.push(a.id);
    }
    if (announce) emit(S, 'good', `${B.name} finished: ${B.couriers.count} bots are hauling`, true);
  } else if (announce) emit(S, 'good', `${B.name} finished`, true);
}

export function demolish(S: State, b: Building) {
  // new fields being laid for it go with it
  for (const o of S.buildings.filter(o => o.of === b.id)) demolish(S, o);
  b.dead = true;
  S.buildings = S.buildings.filter(o => o !== b); S.bmap.delete(b.id);
  const w = S.world;
  for (let j = b.y; j < b.y + b.h; j++) for (let k = b.x; k < b.x + b.w; k++) { w.bgrid[j * w.w + k] = -1; w.bridge[j * w.w + k] = 0; }
  reshaped(w);
  if (bp(S, b).bridge) for (const p of [door(b), farBank(b)]) w.front[p.y * w.w + p.x] = Math.max(0, w.front[p.y * w.w + p.x] - 1);
  else setDoor(S, b, false);
  for (const a of S.agents) if (a.work === b) { a.work = null; a.role = 'carrier'; a.state = 'idle'; a.path = []; }
  b.worker = null; b.hands = [];
  const gone = b.residents.length;
  for (const id of [...b.residents]) { const a = S.amap.get(id); if (a) loseVillager(S, a, 'demolition'); }
  for (const id of b.bots) { const a = S.amap.get(id); if (a) removeAgent(S, a); }
  if (gone) emit(S, 'bad', `${gone} villager${gone > 1 ? 's' : ''} left: their home was demolished`);
}
