/** Renewal: replanning around a building in the way, taking down what stands idle, moving workshops out of centres. */
import { cancelTask, touches } from '../logistics.ts';
import { onNoBuild, fitsWithout } from '../place.ts';
import { inNuisance } from '../surroundings.ts';
import { add, bp, chronicle, ctr, emit, hypot } from '../core.ts';
import { demolish, placeBuilding } from '../buildings.ts';
import { moveHome } from '../lifecycle.ts';
import { sizeName } from '../farms.ts';
import type { BlueprintDef, Building, State, Town } from '../types.ts';
import { goodName, article, ORDINAL, minutes } from './text.ts';
import { T, mineOf, formOf, hubs, affordable, centreOf, shareOf } from './core.ts';
import type { Look } from './sense.ts';
import type { Choice } from './choose.ts';
import { chooseSpot } from './site.ts';

/**
 * Replanning (a wish on its planner's list, at `replan_weight`): tear down old homes of a smaller rung where the new home would stand, as one block.
 * Every home it covers must be finished, of a sparser kind than the new one and at least `replan_min_age`
 * seconds in use; at least one of that kind must remain; the new home must add beds; and the settlement
 * must have free beds elsewhere for everyone living there, who move before anything comes down.
 * Demolition salvages `salvage_share` of the cost into the nearest storage yard. Picks the block that adds
 * the most beds, nearest its district centre, or null when there is none.
 */
export interface Block { x: number; y: number; covers: Building[]; s: number }

export function replanBlock(S: State, town: Town, B: BlueprintDef): Block | null {
  const P = T(S), W = S.world, store = S.bmap.get(town.store);
  if (!store) return null;
  const density = (X: BlueprintDef) => X.homes / (X.w * X.h);
  const homes = S.buildings.filter(b => b.town === town.id && !b.site && bp(S, b).homes);
  const old = (b: Building) => density(bp(S, b)) < density(B) && b.used >= P.replanMinAge;
  const kinds: Record<string, number> = {};
  for (const h of homes) kinds[h.type] = (kinds[h.type] || 0) + 1;
  const spare = (except: Set<Building>) => homes.reduce((n, h) => n + (except.has(h) ? 0 : bp(S, h).homes - h.residents.length), 0);
  const hub = ctr(store);
  let best: Block | null = null;
  for (const h of homes) {
    if (!old(h)) continue;
    for (let y = h.y - (B.h - 1); y <= h.y + h.h - 1; y++) for (let x = h.x - (B.w - 1); x <= h.x + h.w - 1; x++) {
      W.work.plannerSpots++;
      // what the new home's footprint would cover
      const covers = new Set<Building>();
      let ok = true;
      for (let j = y; j < y + B.h && ok; j++) for (let k = x; k < x + B.w && ok; k++) {
        if (k < 0 || j < 0 || k >= W.w || j >= W.h) { ok = false; break; }
        const id = W.bgrid[j * W.w + k];
        if (id === -1) continue;
        const o = S.bmap.get(id);
        if (!o || o.town !== town.id || !bp(S, o).homes || o.site || !old(o)) ok = false; else covers.add(o);
      }
      if (!ok || !covers.size) continue;
      const lost = [...covers].reduce((n, o) => n + bp(S, o).homes, 0);
      if (B.homes <= lost) continue;
      const counts: Record<string, number> = {};
      for (const o of covers) counts[o.type] = (counts[o.type] || 0) + 1;
      if (Object.entries(counts).some(([k, n]) => kinds[k] - n < 1)) continue;
      const movers = [...covers].reduce((n, o) => n + o.residents.length, 0);
      if (spare(covers) < movers) continue;
      if (inNuisance(S, { x: x + B.w / 2, y: y + B.h / 2 }) || onNoBuild(W, x, y, B.w, B.h)) continue;
      // homes share walls only with other homes: anything else keeps its ring of open land
      let ring = false;
      for (let j = y - P.gap; j < y + B.h + P.gap && !ring; j++) for (let k = x - P.gap; k < x + B.w + P.gap && !ring; k++) {
        if (k < 0 || j < 0 || k >= W.w || j >= W.h) continue;
        const o = S.bmap.get(W.bgrid[j * W.w + k]);
        ring = !!o && !covers.has(o) && !bp(S, o).homes;
      }
      if (ring || !fitsWithout(S, B.id, x, y, covers, town)) continue;
      const s = B.homes - lost - P.replanHubWeight * hypot(x + B.w / 2 - hub.x, y + B.h / 2 - hub.y);
      if (!best || s > best.s) best = { x, y, covers: [...covers], s };
    }
  }
  return best;
}

/** Replan the block its planner's wish list chose: everyone moves first, the old homes come down, the new one is planned. */
export function replan(S: State, town: Town, c: Choice, best: Block): boolean {
  const P = T(S), B = c.B, store = S.bmap.get(town.store);
  if (!store) return false;
  const homes = S.buildings.filter(b => b.town === town.id && !b.site && bp(S, b).homes);
  // everyone moves first, to the nearest free bed elsewhere
  const gone = new Set(best.covers);
  for (const o of best.covers) for (const id of [...o.residents]) {
    const a = S.amap.get(id);
    if (!a) continue;
    const to = homes.filter(h => !gone.has(h) && bp(S, h).homes > h.residents.length).sort((p, q) => hypot(ctr(p).x - a.x, ctr(p).y - a.y) - hypot(ctr(q).x - a.x, ctr(q).y - a.y))[0];
    if (!to) return false;
    moveHome(a, to);
  }
  for (const o of best.covers) {
    const salvage = Object.entries(bp(S, o).cost);
    demolish(S, o);
    for (const [k, n] of salvage) store.inv[k] = (store.inv[k] || 0) + Math.floor(n * P.salvageShare);
  }
  const b = placeBuilding(S, B.id, best.x, best.y, false)!;
  b.town = town.id;
  b.priority = 1 + Math.round(c.sev * P.urgencyPriority);
  b.reason = `replanned: ${best.covers.length} old home${best.covers.length > 1 ? 's' : ''} make way for ${B.homes} beds`;
  const Q = town.planner;
  Q.site = b.id; Q.placed++; Q.streak = { type: '', n: 0 };
  Q.status = `Replanning a block for ${article(B.name)} ${B.name}: ${b.reason}`;
  S.stats.replanned++;
  chronicle(S, town.id, 'replanned', `${town.name} replanned a block: ${b.reason}`);
  emit(S, 'info', `${town.name}: ${Q.status}`);
  return true;
}

/**
 * What renewal never touches: what the player placed (or the founders brought), sites, paused buildings, the yards at
 * the heart of a district, homes (replanning renews those), and the buildings that answer a need of their own rather than
 * a good (bridges, docks, places of rites and learning, the hall, counters, depots, sheds, barns, mills, shipyards, fields),
 * and a building something is already being built to take over from.
 */
function kept(S: State, town: Town, b: Building): boolean {
  const B = bp(S, b);
  return !b.reason || b.site || b.paused || b.town !== town.id || town.districts.includes(b.id) || b.burn > 0 || b.flood > 0
    || !!(B.homes || B.bridge || B.shore || B.rite || B.learning || B.hall || B.guards || B.sanitation || B.couriers || B.carts || B.oxen || B.mills || B.shipyard || B.field || B.paves)
    || S.buildings.some(o => o.replaces === b.id);
}

/** Take a building down for renewal: carriers' jobs to and from it cancelled, what it held and `salvage_share` of its cost into the nearest storage yard. */
function takeDown(S: State, town: Town, b: Building) {
  const P = T(S), c = ctr(b);
  const store = hubs(S, town).filter(h => !h.site && h !== b).sort((p, q) => Math.hypot(ctr(p).x - c.x, ctr(p).y - c.y) - Math.hypot(ctr(q).x - c.x, ctr(q).y - c.y))[0] ?? S.bmap.get(town.store);
  // (a site gives back only what was delivered to it)
  const back: [string, number][] = [...Object.entries(b.inv), ...(b.site ? [] : Object.entries(bp(S, b).cost).map(([k, n]): [string, number] => [k, Math.floor(n * P.salvageShare)]))];
  for (const a of S.agents) if (touches(a, b)) cancelTask(a);
  if (town.planner.site === b.id) town.planner.site = null;
  demolish(S, b);
  if (store) for (const [k, n] of back) if (n > 0) add(store.inv, k, n);
}

/**
 * Selective: a workplace that no longer pays comes down. It has stood without work for `idle_seconds` (no worker, no
 * inputs, or resting with enough in store) or, in a town, it takes up a district centre; and the settlement's other
 * makers of everything it makes cover `keep_cover` times what is wanted of it, with none of it short or saved for. Never the
 * last of its kind. The one idle longest comes down; returns whether one did.
 */
function pullDown(S: State, town: Town, L: Look): boolean {
  const P = T(S), Q = town.planner, mine = mineOf(S, town), form = formOf(S, town);
  const count: Record<string, number> = {};
  for (const b of mine) if (!b.site) count[b.type] = (count[b.type] || 0) + 1;
  let best: { b: Building; why: string; s: number } | null = null;
  for (const b of mine) {
    const B = bp(S, b);
    if (kept(S, town, b) || !B.workers || !B.seconds || !Object.keys(B.output).length || count[b.type] < 2) continue;
    const idle = b.idle >= P.idleSeconds, centre = form === 'town' ? centreOf(S, town, b) : undefined;
    if (!idle && !centre) continue;
    const outs = Object.keys(B.output);
    if (outs.some(g => g in Q.wants || Q.saving?.good === g || (L.supply[g] || 0) - shareOf(S, b, g) < (L.demand[g] || 0) * P.keepCover)) continue;
    const n = B.name.toLowerCase(), many = /[^aeiou]y$/.test(n) ? `${n.slice(0, -1)}ies` : `${n}s`;
    const goods = outs.map(g => goodName(S, g)).join(' and '), others = `its other ${count[b.type] > 2 ? `${many} make` : `${n} makes`} the ${goods} it needs`;
    const why = idle ? `${b.status.t === 'No worker free' ? 'no worker' : b.status.t.startsWith('Needs') ? 'nothing to work with' : 'nothing to do'} for ${minutes(b.idle)}, and ${others}`
      : `the town has outgrown it: ${others}, and its land in the centre is wanted for homes`;
    const s = b.idle + (centre ? 1 : 0);
    if (!best || s > best.s) best = { b, why, s };
  }
  if (!best) return false;
  const name = bp(S, best.b).name;
  takeDown(S, town, best.b);
  S.stats.pulledDown++;
  chronicle(S, town.id, 'pulled', `${town.name} pulled down ${article(name)} ${name.toLowerCase()}: ${best.why}`);
  emit(S, 'info', `${town.name}: Pulled down ${article(name)} ${name}: ${best.why}`, true);
  return true;
}

/**
 * Denser (a wish on its planner's list, at `move_out_weight`, at most every `renew_every_seconds`): while the settlement wants homes and is fed, a workplace that needs land or makes noise (a farm not yet grown past
 * `move_max_size`, a forester, a sawmill), or a yard that is not a district's heart, standing in a district centre moves
 * out: a new one is planned where the planner would put one today, beyond every centre, and the old one comes down when it
 * is finished (`finishMoves`), leaving the centre to homes. The largest first, nearest its centre; null with none to move.
 */
export interface Move { b: Building; hub: Building; spot: { x: number; y: number; rot: number } }

export function moveOutWish(S: State, town: Town, L: Look): Move | null {
  const P = T(S);
  // (never while anyone goes hungry; while food is short, the food chain's needs go first on the list)
  if (S.t - town.planner.renewAt < P.renewEverySeconds || formOf(S, town) === 'hamlet' || town.fed < 1 || !L.shortages.some(sh => sh.homes && sh.sev >= P.minSeverity)) return null;
  const cands: { b: Building; hub: Building; s: number }[] = [];
  for (const b of mineOf(S, town)) {
    const B = bp(S, b);
    if (kept(S, town, b) || B.deposit || !(B.harvest || B.nuisance || B.storage || (B.grows && b.size <= P.moveMaxSize))) continue;
    const hub = centreOf(S, town, b);
    if (hub) cands.push({ b, hub, s: b.w * b.h - P.moveOutHubWeight * Math.hypot(ctr(b).x - ctr(hub).x, ctr(b).y - ctr(hub).y) });
  }
  cands.sort((p, q) => q.s - p.s || p.b.id - q.b.id);
  for (const { b, hub } of cands) {
    const B = bp(S, b);
    if (affordable(S, B, town)) continue;
    // (searched with the old one standing: it keeps working, and its ground is no way through, until the new one is built)
    const spot = chooseSpot(S, b.type, town);
    const out = spot && hubs(S, town).every(h => Math.hypot(ctr(h).x - spot.x - B.w / 2, ctr(h).y - spot.y - B.h / 2) > P.centreRadius);
    if (spot && out) return { b, hub, spot };
  }
  return null;
}

/** Move a workplace out of a district centre, as its planner's wish list chose: the new one is its site. */
export function moveOut(S: State, town: Town, m: Move, sev: number) {
  const P = T(S), Q = town.planner, { b, hub, spot } = m, B = bp(S, b);
  {
    const site = placeBuilding(S, b.type, spot.x, spot.y, false, spot.rot)!;
    site.town = town.id; site.replaces = b.id;
    site.priority = 1 + Math.round(sev * P.urgencyPriority);
    const nth = town.districts.indexOf(hub.id), where = nth === 0 ? 'the centre' : `the centre of the ${ORDINAL[nth + 1] ?? `${nth + 1}th`} district`;
    site.reason = `to take over from the ${sizeName(S, b).toLowerCase()} in ${where}, whose land is wanted for homes`;
    Q.site = site.id; Q.placed++; Q.streak = { type: '', n: 0 };
    Q.status = `Moving ${article(B.name)} ${B.name} out of ${where}: its land is wanted for homes`;
    chronicle(S, town.id, 'moved', `${town.name} began moving ${article(B.name)} ${B.name.toLowerCase()} out of ${where}, to make room for homes`);
    emit(S, 'info', `${town.name}: ${Q.status}`, true);
  }
  Q.renewAt = S.t;
}

/** A building that has taken over from one in a centre is finished: the old one comes down, its land left to homes. */
export function finishMoves(S: State, town: Town) {
  for (const b of [...S.buildings]) {
    if (b.town !== town.id || b.replaces === null) continue;
    // a move nobody can reach is given up before anything is delivered: the old one stays where it is
    if (b.site && b.noWay !== null && !Object.values(b.inv).some(n => n > 0)) {
      const name = bp(S, b).name.toLowerCase();
      takeDown(S, town, b);
      chronicle(S, town.id, 'moved', `${town.name} gave up moving its ${name}: nobody could reach the new one`);
      continue;
    }
    if (b.site) continue;
    const old = S.bmap.get(b.replaces);
    b.replaces = null;
    if (!old || old.dead) continue;
    const name = sizeName(S, old).toLowerCase();
    takeDown(S, town, old);
    S.stats.movedOut++;
    chronicle(S, town.id, 'moved', `${town.name} moved its ${name} out of the centre: the old one came down, its land left to homes`);
    emit(S, 'info', `${town.name}: the old ${name} came down, its land left to homes`, true);
  }
}

/**
 * Looking over what it has built, at most every `renew_every_seconds`: a settlement pulls down one workplace that no
 * longer pays (it costs nothing, so it is no wish: the look goes on). Otherwise, in a village or town, moving one out
 * of a district centre is a wish on its list (`moveOutWish`). Returns whether it pulled one down.
 */
export function renew(S: State, town: Town, L: Look): boolean {
  const Q = town.planner;
  if (S.t - Q.renewAt < T(S).renewEverySeconds || !pullDown(S, town, L)) return false;
  Q.renewAt = S.t;
  return true;
}

/** What renewal has in mind for a building, for the inspector: being moved out of a centre, or standing idle long enough to come down. */
export function renewalNote(S: State, b: Building): string | null {
  const town = S.towns[b.town], P = T(S), B = bp(S, b);
  if (!town?.planner.on || b.dead) return null;
  if (b.replaces !== null) { const o = S.bmap.get(b.replaces); return o ? `Takes over from the ${sizeName(S, o).toLowerCase()} in the centre, which comes down when this is built` : null; }
  const site = S.buildings.find(o => o.replaces === b.id);
  if (site) return `Moving out: a new ${bp(S, site).name.toLowerCase()} is being built beyond the centre; this one comes down when it is done`;
  if (kept(S, town, b) || !B.workers || !B.seconds) return null;
  if (b.idle >= 60) return `Idle for ${minutes(b.idle)}: after ${minutes(P.idleSeconds)} it may come down, if the settlement's other makers cover what it makes`;
  return null;
}
