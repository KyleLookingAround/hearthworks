/** Siting: where a blueprint goes, scored over every free spot near the settlement. */
import { findPath, reachable } from '../path.ts';
import { fits, NOBUILD, depositsNear, sealsOff } from '../place.ts';
import { inNuisance } from '../surroundings.ts';
import { beside, bp, ctr, dims, door, FACING, front as frontOf, nearestTown, hypot } from '../core.ts';
import { atRisk, clean, guarded } from '../hardship.ts';
import { maxSize } from '../farms.ts';
import { ZONES, type BlueprintDef, type Building, type ItemId, type State, type Town } from '../types.ts';
import { T, mineOf, covered, treeScore, formOf, hubs, reachOf } from './core.ts';

/** Place: score every free spot near the town for this blueprint; lower is better. */
export function chooseSpot(S: State, type: string, town: Town = S.towns[0], anyZone = false, hub?: Building, win?: { x0: number; y0: number; x1: number; y1: number }): { x: number; y: number; rot: number } | null {
  const P = T(S), B = S.content.blueprints[type], W = S.world;
  // a settlement grows in its newest district: search around that district's centre (or the one asked for)
  const hs = hubs(S, town), store = hub ?? hs[hs.length - 1] ?? S.bmap.get(town.store);
  if (!store) return null;
  const home = ctr(store), mine = mineOf(S, town);
  const harvesters = S.buildings.filter(b => bp(S, b).harvest);
  const producersOf = (g: ItemId) => mine.filter(b => bp(S, b).output[g]);
  const usersOf = (g: ItemId) => mine.filter(b => { const O = bp(S, b); return O.input[g] || O.keepStocked[g]; });
  const houses = mine.filter(b => bp(S, b).homes);
  const makers = B.storage ? mine.filter(b => !b.site && Object.keys(bp(S, b).output).some(g => !B.keeps || B.keeps.includes(g))) : [];
  const unreached = B.couriers ? mine.filter(b => !b.site && !covered(S, ctr(b))) : [];
  // a counter goes where it guards buildings at risk that nothing guards yet
  const exposed = B.guards ? mine.filter(b => atRisk(S, b, B.guards!.hazard) && !guarded(S, b, B.guards!.hazard)) : B.sanitation ? mine.filter(b => atRisk(S, b, 'sickness') && !clean(S, b))
    : B.mills ? mine.filter(b => !b.site && B.mills!.types.includes(b.type) && !mine.some(c => c.type === B.id && hypot(ctr(c).x - ctr(b).x, ctr(c).y - ctr(b).y) <= B.mills!.radius)) : [];
  // a dock has to face water that reaches the nearest neighbour's shore
  const facing = B.shore ? waterFacing(S, town) : null;
  const near = (p: { x: number; y: number }, bs: Building[]) => bs.reduce((m, b) => Math.min(m, hypot(p.x - ctr(b).x, p.y - ctr(b).y)), Infinity);
  const mean = (p: { x: number; y: number }, bs: Building[]) => bs.reduce((s, b) => s + hypot(p.x - ctr(b).x, p.y - ctr(b).y), 0) / bs.length;

  const scored: { x: number; y: number; rot: number; s: number }[] = [];
  // villages and towns set homes wall to wall: no ring of open land between a home and its neighbours
  const form = formOf(S, town), dense = !!B.homes && form !== 'hamlet', gap = dense ? 0 : P.gap;
  const homeAt = (i: number) => { const id = W.bgrid[i]; if (id < 0) return false; const o = S.bmap.get(id); return !!o && !!bp(S, o).homes; };
  const touchesNonHome = (x: number, y: number, bw: number, bh: number) => {
    for (let j = y - P.gap; j < y + bh + P.gap; j++) for (let k = x - P.gap; k < x + bw + P.gap; k++) {
      if (k < 0 || j < 0 || k >= W.w || j >= W.h) continue;
      const i = j * W.w + k;
      if (W.bgrid[i] >= 0 && !homeAt(i)) return true;
    }
    return false;
  };
  // only spots whose door can be walked to from storage: across a river is no use
  const from = door(store), reach = reachable(W, from.x, from.y);
  // the search reaches `search_radius` beyond the district's farthest building, so a growing district keeps finding room
  const R = reachOf(S, town, store), ox = Math.round(home.x - B.w / 2), oy = Math.round(home.y - B.h / 2);
  // zones the player painted: a building keeps to its own kind's zone while that zone has room in reach,
  // stays off other kinds' zones otherwise, and nothing is built on no-build land
  const mine1 = B.zone && !anyZone ? 1 + ZONES.indexOf(B.zone) : 0, nobuild = NOBUILD;
  // a zone belongs to the settlement whose first storage yard is nearest: neighbours keep off each other's
  const ours = (x: number, y: number) => S.towns.length < 2 || nearestTown(S, x + 0.5, y + 0.5) === town.id;
  // a zone of its kind within reach of any of the settlement's districts: search that zone, wherever it lies
  let zoned = false, x0 = ox - R, x1 = ox + R, y0 = oy - R, y1 = oy + R;
  if (mine1) {
    let zx0 = Infinity, zx1 = -Infinity, zy0 = Infinity, zy1 = -Infinity;
    for (const h of hubs(S, town).length ? hubs(S, town) : [store]) {
      const c = ctr(h), M = P.searchRadiusMax;
      for (let y = Math.max(0, Math.floor(c.y - M)); y <= Math.min(W.h - 1, Math.ceil(c.y + M)); y++) for (let x = Math.max(0, Math.floor(c.x - M)); x <= Math.min(W.w - 1, Math.ceil(c.x + M)); x++) {
        if (W.zone[y * W.w + x] !== mine1 || !ours(x, y)) continue;
        zx0 = Math.min(zx0, x); zx1 = Math.max(zx1, x); zy0 = Math.min(zy0, y); zy1 = Math.max(zy1, y);
      }
    }
    if (zx0 <= zx1) { zoned = true; x0 = zx0; x1 = zx1 - B.w + 1; y0 = zy0; y1 = zy1 - B.h + 1; }
  }
  // a search kept to a window (a district's centre, for homes on land freed there)
  if (win) { x0 = Math.max(x0, win.x0); y0 = Math.max(y0, win.y0); x1 = Math.min(x1, win.x1 - B.w + 1); y1 = Math.min(y1, win.y1 - B.h + 1); }
  const zoneOk = (x: number, y: number, strict: boolean, bw: number, bh: number) => {
    for (let j = y; j < y + bh; j++) for (let k = x; k < x + bw; k++) {
      const z = W.zone[j * W.w + k];
      if (z === nobuild || (strict ? z !== mine1 : z !== 0 && (z !== mine1 || !ours(k, j)))) return false;
    }
    return true;
  };
  // a dock turns to face any shore; everything else the planner builds faces south (the player turns what they place)
  // which trees other harvesters reach, worked out once a tree is first weighed
  const taken = B.harvest ? new Uint8Array(W.w * W.h) : undefined;
  for (const rot of B.shore ? [0, 1, 2, 3] : [0]) {
  const { w: bw, h: bh } = dims(B, rot);
  // the harvesters whose ground could reach a spot in the search, with their centres
  const woods = harvesters.map(h => ({ ...ctr(h), r: bp(S, h).harvest!.radius }))
    .filter(h => Math.max(0, x0 + bw / 2 - h.x, h.x - (x1 + bw / 2)) <= h.r + 1 && Math.max(0, y0 + bh / 2 - h.y, h.y - (y1 + bh / 2)) <= h.r + 1);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    W.work.plannerSpots++;
    if (!fits(S, type, x, y, gap, rot)) continue;
    if (!zoneOk(x, y, zoned, bw, bh)) continue;
    const ore = B.deposit ? depositsNear(W, x + bw / 2, y + bh / 2, B.deposit.kind, B.deposit.radius + Math.max(bw, bh) / 2) : 0;
    if (B.deposit && !ore) continue;
    // homes share walls only with other homes: anything else keeps its ring of open land
    if (dense && touchesNonHome(x, y, bw, bh)) continue;
    const at = { x, y, w: bw, h: bh, rot }, dr = door(at), fr = frontOf(at), F = FACING[rot];
    const inside = (q: { x: number; y: number }) => q.x >= 0 && q.y >= 0 && q.x < W.w && q.y < W.h;
    if (!reach[dr.y * W.w + dr.x] && !(inside(fr) && reach[fr.y * W.w + fr.x])) continue;
    if (facing && !(inside(fr) && facing.has(facing.label[fr.y * W.w + fr.x]))) continue;
    const p = { x: x + bw / 2, y: y + bh / 2 };
    // homes and noisy workplaces stay apart
    if (B.homes && inNuisance(S, p)) continue;
    if (B.nuisance && S.buildings.some(o => bp(S, o).homes && hypot(ctr(o).x - p.x, ctr(o).y - p.y) <= B.nuisance!.radius)) continue;
    let s = -P.depositWeight * ore + P.storeWeight * hypot(p.x - home.x, p.y - home.y);
    if (B.harvest) {
      const trees = treeScore(S, p.x, p.y, B.harvest.radius, harvesters, P.sharedTreeWeight, taken);
      if (trees < P.minTrees) continue;
      s -= P.treeWeight * trees;
    } else {
      // keep out of the woods and out of a forester's replanting ground
      for (let j = y - P.gap; j < y + bh + P.gap; j++) for (let k = x - P.gap; k < x + bw + P.gap; k++) if (W.tree[j * W.w + k] === 2) s += 1;
      for (const h of woods) if (hypot(p.x - h.x, p.y - h.y) <= h.r) s += P.forestPenalty;
    }
    // a farm that grows wants open land behind it to grow into (the planner's farms face south: behind is north)
    if (S.farms && B.grows && rot === 0) {
      let rows = 0;
      for (let k = 1; k <= maxSize(B) && rows === k - 1; k++) {
        let open = y - k >= 0;
        for (let i = x; open && i < x + bw; i++) { const t = (y - k) * W.w + i; open = (W.ground[t] === 1 || W.ground[t] === 2) && W.bgrid[t] === -1 && !W.road[t] && !W.front[t]; }
        if (open) rows++;
      }
      s -= S.content.tuning.farms.growRoomWeight * rows;
    }
    for (const i in B.input) { const from = producersOf(i); if (from.length) s += P.linkWeight * near(p, from); }
    for (const o in B.output) { const to = usersOf(o); if (to.length) s += P.linkWeight * mean(p, to); }
    if (B.homes && houses.length) s += P.linkWeight * near(p, houses);
    // a yard beside the makers of what it keeps (any maker, for a yard that takes anything), not in the centre
    if (B.storage && makers.length) s += P.yardWeight * mean(p, makers);
    if (dense) {
      // rows: every tile of wall shared with another home, and a door onto a street
      let shared = 0;
      for (let j = y; j < y + bh; j++) { if (x > 0 && homeAt(j * W.w + x - 1)) shared++; if (x + bw < W.w && homeAt(j * W.w + x + bw)) shared++; }
      s -= P.rowWeight * shared;
      if (inside(fr) && W.road[fr.y * W.w + fr.x]) s -= P.streetWeight;
    }
    // built along the roads: a door onto one (its front tile on a road, or beside it), or looking straight down a short run to one
    if (W.roads > 0) {
      const Rd = S.content.tuning.roads, roadAt = (q: { x: number; y: number }) => inside(q) && W.road[q.y * W.w + q.x] >= 2;
      if (roadAt(fr) || roadAt({ x: fr.x + F[1], y: fr.y + F[0] }) || roadAt({ x: fr.x - F[1], y: fr.y - F[0] })) s -= Rd.frontWeight;
      else for (let k = 2; k <= Rd.nearTiles + 1; k++) { const q = { x: dr.x + F[0] * k, y: dr.y + F[1] * k }; if (!inside(q)) break; if (roadAt(q)) { s -= Rd.nearWeight; break; } if (W.bgrid[q.y * W.w + q.x] !== -1) break; }
    }
    if (B.couriers) {
      // a depot only helps where its bots reach buildings nobody's bots reach yet
      const reach = unreached.filter(b => hypot(p.x - ctr(b).x, p.y - ctr(b).y) <= B.couriers!.radius).length;
      if (!reach) continue;
      s -= P.coverWeight * reach;
    }
    if (B.guards || B.sanitation || B.mills) {
      const n = exposed.filter(b => hypot(p.x - ctr(b).x, p.y - ctr(b).y) <= (B.guards ?? B.sanitation ?? B.mills)!.radius).length;
      if (!n) continue;
      s -= P.coverWeight * n;
    }
    scored.push({ x, y, rot, s });
  }
  }
  // a zone with no spot that fits: fall back to unzoned land rather than build nothing
  if (zoned && !scored.length) return chooseSpot(S, type, town, true, hub, win);
  scored.sort((a, b) => a.s - b.s);
  // doors that can be reached now must stay reachable: a new building never seals off another's way in.
  // Judged from the settlement's first storage yard, which every district centre can reach.
  const main = S.bmap.get(town.store), root = main ? door(main) : from, rootReach = main ? reachable(W, root.x, root.y) : reach;
  // every settlement's doors: neighbours that grow into each other must not wall each other in
  const doors = S.buildings.filter(b => !b.dead && !bp(S, b).bridge).map(b => { const d = door(b); return d.y * W.w + d.x; }).filter(i => rootReach[i]);
  for (const c of scored.slice(0, P.siteTries)) {
    const at = { x: c.x, y: c.y, ...dims(B, c.rot), rot: c.rot }, d = door(at);
    if (!findPath(W, from.x, from.y, d.x, d.y, S.ships ? { fleet: -1 } : {})) continue;
    // the open tile in front of its door, or beside it for a building on the shore
    const o = B.shore ? beside(at) : frontOf(at), front = o.y * W.w + o.x;
    if (sealsOff(W, c.x, c.y, at.w, at.h, root, doors, rootReach[front] ? front : -1)) continue;
    return { x: c.x, y: c.y, rot: c.rot };
  }
  return null;
}

/**
 * The bodies of water that touch the nearest other settlement's land: a dock on one of them can
 * reach it. Labels every water tile by connected body (4-way), then collects the bodies next to
 * land connected to that settlement's storage yard.
 */
function waterFacing(S: State, town: Town): (Set<number> & { label: Int32Array }) | null {
  const w = S.world, N = w.w * w.h, home = S.bmap.get(town.store);
  let target: Building | undefined, best = Infinity;
  for (const t of S.towns) {
    const s = S.bmap.get(t.store);
    if (t === town || !s || !home) continue;
    const d = hypot(s.x - home.x, s.y - home.y);
    if (d < best) { best = d; target = s; }
  }
  const label = new Int32Array(N).fill(-1), land = new Uint8Array(N);
  const flood = (start: number, water: boolean, mark: (i: number) => void, seen: (i: number) => boolean) => {
    const stack = [start];
    while (stack.length) {
      const i = stack.pop()!;
      if (seen(i) || (w.ground[i] === 0) !== water) continue;
      mark(i);
      const x = i % w.w, y = (i / w.w) | 0;
      if (x > 0) stack.push(i - 1);
      if (x < w.w - 1) stack.push(i + 1);
      if (y > 0) stack.push(i - w.w);
      if (y < w.h - 1) stack.push(i + w.w);
    }
  };
  let n = 0;
  for (let i = 0; i < N; i++) if (w.ground[i] === 0 && label[i] < 0) { const id = n++; flood(i, true, j => { label[j] = id; }, j => label[j] >= 0); }
  const out = new Set<number>() as Set<number> & { label: Int32Array };
  out.label = label;
  if (!target) { for (let k = 0; k < n; k++) out.add(k); return out; }
  const td = door(target);
  flood(td.y * w.w + td.x, false, j => { land[j] = 1; }, j => land[j] === 1);
  for (let i = 0; i < N; i++) {
    if (!land[i]) continue;
    const x = i % w.w, y = (i / w.w) | 0;
    for (const j of [x > 0 ? i - 1 : -1, x < w.w - 1 ? i + 1 : -1, y > 0 ? i - w.w : -1, y < w.h - 1 ? i + w.w : -1]) if (j >= 0 && label[j] >= 0) out.add(label[j]);
  }
  return out;
}

/**
 * Homes go first onto open land in the district centres, oldest first (where a workplace moved out or came down),
 * searched within `centre_radius` of each centre; elsewhere only when none has room.
 */
export function centreSpot(S: State, type: string, town: Town): { x: number; y: number; rot: number } | null {
  const r = T(S).centreRadius;
  for (const h of hubs(S, town)) {
    if (h.site) continue;
    const c = ctr(h), spot = chooseSpot(S, type, town, false, h, { x0: Math.floor(c.x - r), y0: Math.floor(c.y - r), x1: Math.ceil(c.x + r), y1: Math.ceil(c.y + r) });
    if (spot) return spot;
  }
  return null;
}

/** Would a building at this spot have its door on a road (its front tile on one or beside one), as placement scores it? */
export function alongRoad(S: State, B: BlueprintDef, at: { x: number; y: number; rot: number }): boolean {
  const W = S.world, fr = frontOf({ x: at.x, y: at.y, ...dims(B, at.rot), rot: at.rot }), F = FACING[at.rot];
  return [fr, { x: fr.x + F[1], y: fr.y + F[0] }, { x: fr.x - F[1], y: fr.y - F[0] }].some(q => q.x >= 0 && q.y >= 0 && q.x < W.w && q.y < W.h && W.road[q.y * W.w + q.x] >= 2);
}
