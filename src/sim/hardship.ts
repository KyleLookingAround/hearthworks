/**
 * Hardship (Phase 20): fire, flood, sickness and barbarians, and the counters a settlement finds for each.
 * See design/systems/hardship.md. Every draw comes from S.hrng, never S.rng, so hardship cannot shift the
 * rest of the world; with hardship off nothing here runs.
 *
 *   fire       wooden buildings catch fire and it spreads to their close neighbours; a well's fire crew douses it
 *   flood      each spring the waters rise over low land by the shore; a levee holds them back
 *   sickness   crowded settlements fall sick, home to home; a healer shortens it and saves lives
 *   raids      camps in the wild land far from any settlement raid the nearest one's stores; watchtowers,
 *              palisades and a militia beat them off, and settling the wilds breaks the camps up
 */
import { rand } from './rng.ts';
import { release, removeAgent } from './agents.ts';
import { cancelTask, touches } from './logistics.ts';
import { findPath } from './path.ts';
import { add, bp, chronicle, ctr, emit, front, nearestTown, villagers } from './world.ts';
import type { Building, Camp, Hazard, State, Town } from './types.ts';

const H = (S: State) => S.content.tuning.hardship;

/** Tiles of open ground between two buildings' footprints (0 when they touch). */
const gap = (a: Building, b: Building) => Math.hypot(Math.max(0, a.x - (b.x + b.w), b.x - (a.x + a.w)), Math.max(0, a.y - (b.y + b.h), b.y - (a.y + a.h)));

/** A counter at work: built, and its worker (the fire crew, the healer, the lookout) at their post if it has one. */
function manned(S: State, c: Building): boolean {
  if (c.site || c.burn > 0 || c.flood > 0) return false;
  if (!bp(S, c).workers) return true;
  const w = c.worker !== null ? S.amap.get(c.worker) : undefined;
  return !!w && w.state === 'working';
}

/** The counters at work that guard this point against a hazard. */
export function guardsOf(S: State, p: { x: number; y: number }, hazard: Hazard): Building[] {
  return S.buildings.filter(c => { const G = bp(S, c).guards; return !!G && G.hazard === hazard && manned(S, c) && Math.hypot(ctr(c).x - p.x, ctr(c).y - p.y) <= G.radius; });
}
export const guarded = (S: State, b: Building, hazard: Hazard) => guardsOf(S, ctr(b), hazard).length > 0;

/** Is a home kept clean (sanitation: a bathhouse at work within its radius)? */
export const clean = (S: State, b: Building) => S.buildings.some(c => { const C = bp(S, c).sanitation; return !!C && c.town === b.town && manned(S, c) && Math.hypot(ctr(c).x - ctr(b).x, ctr(c).y - ctr(b).y) <= C.radius; });

/** Does it burn? Anything built without a fireproof good (bricks, cut stone), bridges aside. */
export const burns = (S: State, b: Building) => { const B = bp(S, b); return !B.bridge && !B.paves && !Object.keys(B.cost).some(k => H(S).fireproof.includes(k)); };

/** Low land by the water: a tile of its footprint within `flood_reach` of water, no higher than `flood_height`. */
export function floodLand(S: State, b: Building): boolean {
  const W = S.world, Z = H(S), r = Z.floodReach;
  if (bp(S, b).bridge || bp(S, b).shore) return false;
  for (let y = b.y; y < b.y + b.h; y++) for (let x = b.x; x < b.x + b.w; x++) {
    if (W.height[y * W.w + x] > Z.floodHeight) continue;
    for (let j = y - r; j <= y + r; j++) for (let k = x - r; k <= x + r; k++) {
      if (k < 0 || j < 0 || k >= W.w || j >= W.h) continue;
      if (!W.ground[j * W.w + k] && !W.bridge[j * W.w + k] && Math.hypot(k - x, j - y) <= r) return true;
    }
  }
  return false;
}

/** What a hazard threatens in a settlement: what burns, low land by the water, homes with people, and (raiders) its first storage yard, which they make for. */
export function atRisk(S: State, b: Building, hazard: Hazard): boolean {
  if (b.site) return false;
  const B = bp(S, b);
  if (hazard === 'fire') return burns(S, b);
  if (hazard === 'flood') return floodLand(S, b);
  if (hazard === 'sickness') return !!B.homes && b.residents.length > 0;
  return S.towns[b.town]?.store === b.id;
}

/** Share of a settlement's buildings at risk from a hazard that no counter guards, 0 to 1. */
export function unguarded(S: State, town: Town, hazard: Hazard): number {
  const mine = S.buildings.filter(b => b.town === town.id && atRisk(S, b, hazard));
  return mine.length ? mine.filter(b => !guarded(S, b, hazard)).length / mine.length : 0;
}

/** Was this settlement struck by the hazard within `memory_seconds`? */
export const struckLately = (S: State, town: Town, hazard: Hazard) => S.hardship && town.struck[hazard] !== undefined && S.t - town.struck[hazard] <= H(S).memorySeconds;

function record(S: State, town: Town | undefined, hazard: Hazard, text: string) {
  if (!town) return;
  town.struck[hazard] = S.t;
  chronicle(S, town.id, hazard, text);
  emit(S, 'bad', text);
}

/** Once a second: fires, floods, sickness and the barbarians' camps. */
export function updateHardship(S: State, dt: number) {
  if (!S.hardship) return;
  fires(S, dt);
  floods(S);
  sickness(S, dt);
  camps(S, dt);
}

// ---- fire ----

export function ignite(S: State, b: Building, outbreak: boolean) {
  if (b.burn > 0 || b.site || !burns(S, b)) return;
  b.burn = guarded(S, b, 'fire') ? H(S).douseSeconds : H(S).burnSeconds;
  // nobody carries to or from a burning building, and its worker gets out
  for (const a of S.agents) if (touches(a, b)) cancelTask(a);
  if (outbreak) {
    S.stats.fires++;
    const town = S.towns[b.town];
    record(S, town, 'fire', `Fire broke out at ${town ? `a ${bp(S, b).name.toLowerCase()} in ${town.name}` : `a ${bp(S, b).name.toLowerCase()}`}`);
  }
}

function fires(S: State, dt: number) {
  const Z = H(S);
  // each building that burns catches fire about once every `fire_every_seconds`
  for (const b of [...S.buildings]) if (!b.burn && !b.site && burns(S, b) && rand(S.hrng) < dt / Z.fireEverySeconds) ignite(S, b, true);
  for (const b of [...S.buildings]) {
    if (b.burn <= 0) continue;
    const doused = guarded(S, b, 'fire');
    // a fire with no crew to fight it jumps to buildings within `spread_gap`
    if (!doused) for (const o of S.buildings) if (o !== b && !o.burn && !o.site && gap(b, o) <= Z.spreadGap && burns(S, o) && rand(S.hrng) < Z.spreadChance * dt) ignite(S, o, false);
    if (doused) b.burn = Math.min(b.burn, Z.douseSeconds);
    b.burn -= dt;
    if (b.burn > 0) continue;
    b.burn = 0;
    // what was inside burns
    for (const k in b.inv) b.inv[k] = Math.floor(b.inv[k] * (1 - Z.fireLoss));
    if (doused) { emit(S, 'good', `The fire at the ${bp(S, b).name.toLowerCase()} was put out`, true); continue; }
    // a storage yard is open piles: what burnt is gone, and the yard stands
    if (bp(S, b).storage) continue;
    gut(S, b);
  }
}

/**
 * Burnt out: it stands gutted, a construction site again that needs `rebuild_share` of its cost. Its people
 * stay on in the shell; its worker goes carrying until it is rebuilt.
 */
function gut(S: State, b: Building) {
  const B = bp(S, b), Z = H(S);
  for (const a of S.agents) if (touches(a, b)) cancelTask(a);
  release(S, b);
  // a depot's bots burn with it: rebuilt, it winds up new ones
  for (const id of b.bots) { const bot = S.amap.get(id); if (bot) removeAgent(S, bot); }
  b.bots = [];
  b.site = true; b.build = 0; b.incoming = {}; b.reserved = {}; b.waiting = {}; b.timer = 0; b.used = 0;
  b.inv = {};
  for (const k in B.cost) { const left = Math.floor(B.cost[k] * (1 - Z.rebuildShare)); if (left > 0) b.inv[k] = left; }
  // the last maker of a good its own rebuilding needs is rebuilt from what its makers save of it, or nothing could rebuild it
  for (const k in B.cost) if (B.output[k] && !S.buildings.some(o => o !== b && o.town === b.town && !o.site && bp(S, o).output[k])) b.inv[k] = B.cost[k];
  b.priority = Math.max(b.priority, 1 + S.content.tuning.planner.urgencyPriority);
  b.reason = 'rebuilding after the fire';
  S.stats.burnt++;
  const town = S.towns[b.town];
  if (town) chronicle(S, town.id, 'fire', `A ${B.name.toLowerCase()} in ${town.name} burnt out and is being rebuilt`);
}

// ---- flood ----

function floods(S: State) {
  const Z = H(S), year = S.content.tuning.seasons.yearSeconds, t = Math.floor(S.t);
  // the waters rise at the turn of each year: the spring thaw (with seasons on, the first day of spring)
  if (t < year || t % year !== 0) return;
  if (rand(S.hrng) >= Z.floodChance) return;
  rise(S);
}

function rise(S: State) {
  const Z = H(S), hit = new Map<number, number>();
  for (const b of S.buildings) {
    if (b.site || !floodLand(S, b) || guarded(S, b, 'flood')) continue;
    b.flood = Z.floodSeconds;
    for (const k in b.inv) b.inv[k] = Math.floor(b.inv[k] * (1 - Z.floodLoss));
    hit.set(b.town, (hit.get(b.town) || 0) + 1);
  }
  if (!hit.size) { emit(S, 'info', `The waters rose${S.seasons ? ' with the thaw' : ''}, but reached nothing`, true); return; }
  for (const [id, n] of hit) { S.stats.floods++; record(S, S.towns[id], 'flood', `The waters rose over ${S.towns[id]?.name ?? 'the low land'}: ${n} building${n > 1 ? 's' : ''} flooded`); }
}

// ---- sickness ----

/**
 * Bring a hazard down on a settlement now, as the gates do when one has not come of itself: a fire in one of
 * its buildings, the waters rising, sickness in one of its homes, or raiders from the nearest camp (pitched on
 * the nearest wild land if there is none). Returns false if there was nothing for it to strike.
 */
export function strike(S: State, town: Town, hazard: Hazard): boolean {
  const pick = <T>(xs: T[]) => xs[Math.floor(rand(S.hrng) * xs.length)];
  if (hazard === 'fire') {
    const b = pick(S.buildings.filter(o => o.town === town.id && !o.site && !o.burn && burns(S, o)));
    if (b) ignite(S, b, true);
    return !!b;
  }
  if (hazard === 'flood') { const n = S.stats.floods; rise(S); return S.stats.floods > n; }
  if (hazard === 'sickness') {
    const b = pick(S.buildings.filter(o => o.town === town.id && !o.site && !o.sick && bp(S, o).homes && o.residents.length));
    if (!b) return false;
    fallSick(S, b); S.stats.outbreaks++;
    record(S, town, 'sickness', `Sickness broke out in ${town.name}`);
    return true;
  }
  const s = S.bmap.get(town.store);
  if (!s) return false;
  const p = ctr(s), W = S.world, dist = (x: number, y: number) => Math.hypot(x - p.x, y - p.y);
  let c = [...S.camps].filter(o => !o.raid).sort((a, b) => dist(a.x, a.y) - dist(b.x, b.y))[0];
  if (!c) {
    const i = wildLand(S).sort((a, b) => dist(a % W.w, Math.floor(a / W.w)) - dist(b % W.w, Math.floor(b / W.w)))[0];
    if (i === undefined) return false;
    c = { id: S.nextId++, x: (i % W.w) + 0.5, y: Math.floor(i / W.w) + 0.5, strength: H(S).campStrength, raidT: 0, raid: null };
    S.camps.push(c); S.stats.camps++;
  }
  c.raidT = H(S).raidEverySeconds;
  raid(S, c);
  return !!c.raid;
}

function sickness(S: State, dt: number) {
  const Z = H(S), pop = new Map<number, number>();
  for (const a of villagers(S)) if (a.home) pop.set(a.home.town, (pop.get(a.home.town) || 0) + 1);
  // a crowded settlement (from `sick_at` people) falls sick about once every `sickness_every_seconds` per villager
  for (const town of S.towns) {
    const n = pop.get(town.id) || 0;
    if (n < Z.sickAt || rand(S.hrng) >= dt * n / Z.sicknessEverySeconds) continue;
    const homes = S.buildings.filter(b => b.town === town.id && !b.site && !b.sick && bp(S, b).homes && b.residents.length);
    if (!homes.length) continue;
    const b = homes[Math.floor(rand(S.hrng) * homes.length)];
    // a home kept clean falls sick only `clean_factor` as often
    if (clean(S, b) && rand(S.hrng) >= Z.cleanFactor) continue;
    fallSick(S, b);
    S.stats.outbreaks++;
    record(S, town, 'sickness', `Sickness broke out in ${town.name}`);
  }
  for (const b of [...S.buildings]) {
    if (b.sick <= 0) continue;
    const healed = guarded(S, b, 'sickness');
    if (healed) b.sick = Math.min(b.sick, Z.healedSeconds);
    else for (const o of S.buildings) if (o !== b && !o.sick && !o.site && bp(S, o).homes && o.residents.length && gap(b, o) <= Z.sickSpreadGap && rand(S.hrng) < Z.sickSpreadChance * dt * (clean(S, o) ? Z.cleanFactor : 1)) fallSick(S, o);
    b.sick -= dt;
    if (b.sick > 0) continue;
    b.sick = 0;
    // as it passes, some of the sick die: fewer with a healer
    const town = S.towns[b.town];
    for (const id of [...b.residents]) {
      const a = S.amap.get(id);
      if (!a || rand(S.hrng) >= (healed ? Z.healedDeath : Z.sickDeath)) continue;
      removeAgent(S, a);
      S.stats.deaths++; S.stats.sickDeaths++;
      if (S.people && town) town.rites.push(S.t);
      emit(S, 'bad', `A villager of ${town?.name ?? 'the village'} died of the sickness`, true);
    }
  }
}

function fallSick(S: State, b: Building) {
  b.sick = guarded(S, b, 'sickness') ? H(S).healedSeconds : H(S).sickSeconds;
}

/** Share of a settlement's people in sick homes. */
export function sickShare(S: State, town: Town): number {
  let n = 0, sick = 0;
  for (const b of S.buildings) if (b.town === town.id && bp(S, b).homes) { n += b.residents.length; if (b.sick > 0) sick += b.residents.length; }
  return n ? sick / n : 0;
}

// ---- barbarians ----

/** Settled land on a coarse grid of 4-tile cells: within `wild_distance` of any building. */
const CELL = 4;
function settledCells(S: State): { cols: number; rows: number; settled: Uint8Array } {
  const W = S.world, cols = Math.ceil(W.w / CELL), rows = Math.ceil(W.h / CELL), settled = new Uint8Array(cols * rows), R = H(S).wildDistance / CELL;
  for (const b of S.buildings) {
    const c = ctr(b), cx = c.x / CELL, cy = c.y / CELL;
    for (let y = Math.max(0, Math.floor(cy - R)); y <= Math.min(rows - 1, Math.ceil(cy + R)); y++) for (let x = Math.max(0, Math.floor(cx - R)); x <= Math.min(cols - 1, Math.ceil(cx + R)); x++) {
      if (Math.hypot(x + 0.5 - cx, y + 0.5 - cy) <= R) settled[y * cols + x] = 1;
    }
  }
  return { cols, rows, settled };
}

/** Wild land: open ground (grass or sand) in cells no settlement reaches, as tile indices of each cell's middle. */
export function wildLand(S: State): number[] {
  const W = S.world, { cols, rows, settled } = settledCells(S), out: number[] = [];
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    if (settled[y * cols + x]) continue;
    const tx = Math.min(W.w - 1, x * CELL + 2), ty = Math.min(W.h - 1, y * CELL + 2), i = ty * W.w + tx;
    if ((W.ground[i] === 1 || W.ground[i] === 2) && W.bgrid[i] === -1) out.push(i);
  }
  return out;
}

function camps(S: State, dt: number) {
  const Z = H(S), W = S.world;
  S.campT += dt;
  if (S.campT >= Z.campEverySeconds) {
    S.campT = 0;
    const { cols, settled } = settledCells(S), wild = wildLand(S);
    // settling the wilds: a camp the settlements have grown up to breaks up
    for (const c of [...S.camps]) {
      if (!settled[Math.floor(c.y / CELL) * cols + Math.floor(c.x / CELL)] || (c.raid && !c.raid.back)) continue;
      S.camps = S.camps.filter(o => o !== c);
      const t = S.towns[nearestTown(S, c.x, c.y)];
      if (t) chronicle(S, t.id, 'raids', `${t.name}'s people settled the wilds where a barbarian camp stood, and it broke up`);
      emit(S, 'good', 'Settlers reached a barbarian camp in the wilds, and it broke up');
    }
    // more camps where more land lies untouched: one per `wild_tiles_per_camp` tiles of it
    const room = Math.floor((wild.length * CELL * CELL) / Z.wildTilesPerCamp);
    if (S.camps.length < room && wild.length) {
      // they gather on the edge of the wilds, within `raid_reach` of a settlement's stores, when there is any such land
      const stores = S.towns.map(t => S.bmap.get(t.store)).filter(b => !!b).map(b => ctr(b!));
      const near = wild.filter(i => stores.some(p => Math.hypot((i % W.w) + 0.5 - p.x, Math.floor(i / W.w) + 0.5 - p.y) <= Z.raidReach));
      const from = near.length ? near : wild;
      const i = from[Math.floor(rand(S.hrng) * from.length)];
      const c: Camp = { id: S.nextId++, x: (i % W.w) + 0.5, y: Math.floor(i / W.w) + 0.5, strength: Z.campStrength, raidT: Z.raidEverySeconds * (0.5 + rand(S.hrng)), raid: null };
      S.camps.push(c);
      S.stats.camps++;
      emit(S, 'bad', 'Barbarians have made camp in the wilds');
    }
  }
  for (const c of S.camps) {
    // a camp grows as it is left alone
    c.strength = Math.min(Z.campMax, c.strength + dt / Z.campGrowSeconds);
    if (c.raid) continue;
    c.raidT -= dt;
    if (c.raidT > 0) continue;
    c.raidT = Z.raidEverySeconds * (0.75 + rand(S.hrng) * 0.5);
    raid(S, c);
  }
}

/** Send a camp's raiders at the nearest settlement within `raid_reach` they can walk to. */
function raid(S: State, c: Camp) {
  const W = S.world, Z = H(S);
  const targets = S.towns.map(t => ({ t, s: S.bmap.get(t.store) })).filter(o => o.s).sort((a, b) => Math.hypot(ctr(a.s!).x - c.x, ctr(a.s!).y - c.y) - Math.hypot(ctr(b.s!).x - c.x, ctr(b.s!).y - c.y));
  for (const { t, s } of targets) {
    if (Math.hypot(ctr(s!).x - c.x, ctr(s!).y - c.y) > Z.raidReach) break;
    const f = front(s!), p = findPath(W, Math.floor(c.x), Math.floor(c.y), f.x, f.y);
    if (!p || p.length > Z.raidReach * 1.5 || p.some(([x, y]) => !W.ground[y * W.w + x] && !W.bridge[y * W.w + x])) continue;
    c.raid = { town: t.id, path: p, x: c.x, y: c.y, n: Math.floor(c.strength), back: false, loot: 0 };
    emit(S, 'bad', `Raiders are on their way to ${t.name}`, true);
    return;
  }
}

/** Every step: raiding parties walk at `raid_speed` tiles a second, and fall on the stores when they arrive. */
export function moveRaids(S: State, dt: number) {
  if (!S.hardship) return;
  for (const c of [...S.camps]) {
    const r = c.raid;
    if (!r) continue;
    let step = H(S).raidSpeed * dt;
    while (step > 0 && r.path.length) {
      const [tx, ty] = r.path[0], gx = tx + 0.5, gy = ty + 0.5, d = Math.hypot(gx - r.x, gy - r.y);
      if (d <= step) { r.x = gx; r.y = gy; r.path.shift(); step -= d; } else { r.x += (gx - r.x) / d * step; r.y += (gy - r.y) / d * step; step = 0; }
    }
    if (r.path.length) continue;
    if (r.back) { c.raid = null; continue; }
    fallOn(S, c);
  }
}

/** A settlement's strength against raiders at its first storage yard: its counters there, and its militia. */
export function defence(S: State, town: Town): { total: number; militia: number; warned: boolean } {
  const s = S.bmap.get(town.store), Z = H(S);
  if (!s) return { total: 0, militia: 0, warned: false };
  const guards = guardsOf(S, ctr(s), 'raids');
  // a lookout on a watchtower sees them coming, and the whole militia musters; otherwise only some do
  const warned = guards.some(g => bp(S, g).workers > 0);
  const adults = villagers(S).filter(a => a.home?.town === town.id && a.role !== 'child').length;
  const militia = adults * Z.militiaShare * (warned ? 1 : Z.surprisedShare);
  return { total: guards.reduce((n, g) => n + bp(S, g).guards!.defence, 0) + militia, militia, warned };
}

function fallOn(S: State, c: Camp) {
  const r = c.raid!, town = S.towns[r.town], Z = H(S), W = S.world;
  S.stats.raids++;
  const D = defence(S, town);
  if (D.total >= r.n) {
    S.stats.repelled++;
    c.strength -= r.n * Z.raidLoss;
    record(S, town, 'raids', `${town.name} beat off ${r.n} raiders${D.warned ? ', warned by its lookout' : ''}`);
  } else {
    // they take `raid_take` of every good in the settlement's stores
    let took = 0;
    for (const b of S.buildings) {
      if (b.town !== town.id || b.site || !bp(S, b).storage) continue;
      for (const k in b.inv) { const n = Math.floor(((b.inv[k] || 0) - (b.reserved[k] || 0)) * Z.raidTake); if (n > 0) { add(b.inv, k, -n); took += n; } }
    }
    r.loot = took; S.stats.looted += took;
    record(S, town, 'raids', `Raiders fell on ${town.name}'s stores and carried off ${took} goods`);
  }
  if (c.strength < 1) {
    S.camps = S.camps.filter(o => o !== c);
    chronicle(S, town.id, 'raids', `${town.name}'s militia broke the camp that raided it`);
    return;
  }
  // back to camp
  const p = findPath(W, Math.floor(r.x), Math.floor(r.y), Math.floor(c.x), Math.floor(c.y));
  r.back = true; r.path = p ?? [];
}

