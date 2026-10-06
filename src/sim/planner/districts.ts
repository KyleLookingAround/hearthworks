/** Districts: founding a new one round its own storage yard, laying its streets, paving worn paths. */
import { reachable } from '../path.ts';
import { fits, NOBUILD, onNoBuild, cutsOff } from '../place.ts';
import { chronicle, ctr, door, emit, front as frontOf, hypot } from '../core.ts';
import { placeBuilding } from '../buildings.ts';
import type { State, Town } from '../types.ts';
import { ORDINAL } from './text.ts';
import { T, hubs, members, reachOf } from './core.ts';

/**
 * A district splits off once the newest one holds `district_buildings` buildings: a storage yard is planned
 * as the new district's centre, on open land it can be walked to, about `district_spacing` from every other
 * centre, where there is most grass around to grow into. The newest district is where a settlement grows,
 * so each look only searches one district, and planning cost follows district size, not town size.
 */
export function foundDistrict(S: State, town: Town): boolean {
  const P = T(S), W = S.world, hs = hubs(S, town), newest = hs[hs.length - 1];
  if (!newest || newest.site || members(S, town, newest).length < P.districtBuildings) return false;
  const B = S.content.blueprints.storage, first = door(hs[0]), reach = reachable(W, first.x, first.y), c = ctr(newest), RD = S.content.tuning.roads;
  const R = P.districtSpacing + 8;
  const cands: { x: number; y: number; s: number }[] = [];
  for (let y = Math.floor(c.y - R); y <= Math.ceil(c.y + R); y++) for (let x = Math.floor(c.x - R); x <= Math.ceil(c.x + R); x++) {
    W.work.plannerSpots++;
    const p = { x: x + B.w / 2, y: y + B.h / 2 };
    const d = hs.reduce((m, h) => Math.min(m, hypot(ctr(h).x - p.x, ctr(h).y - p.y)), Infinity);
    if (d < P.districtSpacing * 0.8 || d > P.districtSpacing * 1.4) continue;
    if (!fits(S, 'storage', x, y, P.gap) || onNoBuild(W, x, y, B.w, B.h)) continue;
    const dr = door({ x, y, w: B.w, h: B.h });
    if (!reach[(dr.y + 1) * W.w + dr.x]) continue;
    let grass = 0, road = 0;
    for (let j = -8; j <= 8; j++) for (let k = -8; k <= 8; k++) { const xx = Math.round(p.x) + k, yy = Math.round(p.y) + j; if (xx >= 0 && yy >= 0 && xx < W.w && yy < W.h) { const i = yy * W.w + xx; if (W.ground[i] === 2 && W.bgrid[i] === -1) grass++; if (W.road[i] >= 2 && Math.abs(j) <= RD.districtReach && Math.abs(k) <= RD.districtReach) road++; } }
    // a new district grows along a road: its heart beside one, where the road runs on through open land
    cands.push({ x, y, s: Math.abs(d - P.districtSpacing) - P.districtRoomWeight * grass - (road ? RD.districtWeight : 0) });
  }
  cands.sort((a, b) => a.s - b.s);
  const best = cands.slice(0, 8).find(p => !cutsOff(S, town, 'storage', p.x, p.y));
  if (!best) return false;
  const b = placeBuilding(S, 'storage', best.x, best.y, false)!;
  b.town = town.id; b.priority = 1 + P.urgencyPriority; b.reason = `the heart of a new district: the old one has filled up`;
  town.districts.push(b.id);
  const Q = town.planner;
  Q.site = b.id; Q.placed++; Q.streak = { type: '', n: 0 };
  const nth = ORDINAL[town.districts.length] ?? `${town.districts.length}th`;
  Q.status = `Founding a ${nth} district: the old one has filled up`;
  chronicle(S, town.id, 'district', `${town.name} founded a ${nth} district`);
  emit(S, 'info', `${town.name}: ${Q.status}`);
  return true;
}

/**
 * A town lays a street grid around each district centre that has none yet: rows every `street_every_rows`
 * tiles (so a terrace two tiles deep fits between, its door on the street below) and cross streets every
 * `street_every_cols`, within `street_radius`, on open land only: never through buildings, trees or rock.
 */
export function layStreets(S: State, town: Town) {
  const P = T(S), W = S.world;
  for (const hub of town.districts) {
    if (town.streets.includes(hub)) continue;
    const b = S.bmap.get(hub);
    if (!b) continue;
    town.streets.push(hub);
    const d = frontOf(b), R = P.streetRadius;
    for (let y = d.y - R; y <= d.y + R; y++) for (let x = d.x - R; x <= d.x + R; x++) {
      if (x < 0 || y < 0 || x >= W.w || y >= W.h) continue;
      const row = ((y - d.y) % P.streetEveryRows + P.streetEveryRows) % P.streetEveryRows === 0;
      const col = ((x - d.x) % P.streetEveryCols + P.streetEveryCols) % P.streetEveryCols === 0;
      const i = y * W.w + x;
      // streets are paths; a road already there stays a road
      if ((row || col) && (W.ground[i] === 1 || W.ground[i] === 2) && W.bgrid[i] === -1 && W.tree[i] !== 2 && W.zone[i] !== NOBUILD && W.road[i] < 2) W.road[i] = 1;
    }
    emit(S, 'info', `${town.name} laid out streets: it has grown into a town`, true);
  }
}

/**
 * Desire paths: the most worn tiles around the settlement, worn past `pave_wear` footsteps, become road,
 * up to `pave_per_look` at a time. Roads follow where people really walk.
 */
export function pave(S: State, town: Town) {
  const P = T(S), W = S.world, seen = new Set<number>(), worn: number[] = [];
  for (const hub of hubs(S, town)) {
  const home = ctr(hub), R = reachOf(S, town, hub);
  for (let y = Math.max(0, Math.floor(home.y - R)); y <= Math.min(W.h - 1, Math.ceil(home.y + R)); y++) for (let x = Math.max(0, Math.floor(home.x - R)); x <= Math.min(W.w - 1, Math.ceil(home.x + R)); x++) {
    const i = y * W.w + x;
    if (W.wear[i] >= P.paveWear && !W.road[i] && W.bgrid[i] === -1 && W.zone[i] !== NOBUILD && (W.ground[i] === 1 || W.ground[i] === 2) && !seen.has(i)) { seen.add(i); worn.push(i); }
  }
  }
  worn.sort((a, b) => W.wear[b] - W.wear[a] || a - b);
  for (const i of worn.slice(0, P.pavePerLook)) { W.road[i] = 1; W.tree[i] = 0; }
}
