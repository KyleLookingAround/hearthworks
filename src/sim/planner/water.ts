/** Water: bridges over it, docks on its shore, and land cleared for what must stand by it. */
import { reachable } from '../path.ts';
import { cancelTask, touches } from '../logistics.ts';
import { add, bp, chronicle, ctr, door, hypot } from '../core.ts';
import { demolish, lift } from '../buildings.ts';
import { enoughInStore, foodChainOf } from '../production.ts';
import type { BlueprintDef, Building, State, Town, World } from '../types.ts';
import { article } from './text.ts';
import { T, mineOf, hubs } from './core.ts';
import { chooseSpot } from './site.ts';

/**
 * Room on the shore for a dock where there is none: one of the settlement's finished workshops within `clear_reach`
 * tiles of water, cheapest first (up to `clear_tries` of them; never a home, a storage yard, a workplace of the food
 * chain, a bridge or a place of rites), whose ground would take the dock if it came down. It comes down, its carriers'
 * jobs cancelled and `salvage_share` of its cost back in storage, and the spot is returned.
 */
/**
 * Room for a university: a workshop resting with enough in store comes down for it, and the chronicle says so. Only once
 * the university is chosen and paid for; before that, with `commit` false, it only asks whether one could (nothing comes down).
 */
export function clearFor(S: State, town: Town, B: BlueprintDef, commit = true): { x: number; y: number; rot: number } | null {
  const cleared = clearShore(S, town, B, true, commit);
  if (cleared && commit) chronicle(S, town.id, 'replanned', `${town.name} cleared ${article(bp(S, cleared.cut).name)} ${bp(S, cleared.cut).name.toLowerCase()}, with enough in store, to make room for ${article(B.name)} ${B.name}`);
  return cleared?.spot ?? null;
}

export function clearShore(S: State, town: Town, B: BlueprintDef, idle = false, commit = true): { spot: { x: number; y: number; rot: number }; cut: Building } | null {
  const P = T(S), W = S.world, chain = foodChainOf(S), store = S.bmap.get(town.store);
  if (!store) return null;
  const nearWater = (b: Building) => {
    for (let j = b.y - P.clearReach; j < b.y + b.h + P.clearReach; j++) for (let k = b.x - P.clearReach; k < b.x + b.w + P.clearReach; k++)
      if (k >= 0 && j >= 0 && k < W.w && j < W.h && W.ground[j * W.w + k] === 0) return true;
    return false;
  };
  const cost = (b: Building) => Object.values(bp(S, b).cost).reduce((s, n) => s + n, 0);
  const cands = mineOf(S, town).filter(b => {
    const O = bp(S, b);
    // (for a university: any workshop resting with enough of its goods in store, wherever it stands)
    return !b.site && !O.homes && !O.storage && !O.bridge && !O.shore && !O.rite && !O.learning && !Object.keys(O.output).some(g => chain.has(g)) && (idle ? O.workers > 0 && Object.keys(O.output).length > 0 && enoughInStore(S, b) : nearWater(b));
  }).sort((a, b) => cost(a) - cost(b) || a.id - b.id).slice(0, P.clearTries);
  for (const b of cands) {
    const back = lift(S, b);
    let spot: { x: number; y: number; rot: number } | null = null;
    for (const h of hubs(S, town).reverse()) spot ??= chooseSpot(S, B.id, town, false, h);
    back();
    if (!spot) continue;
    if (!commit) return { spot, cut: b };
    for (const a of S.agents) if (touches(a, b)) cancelTask(a);
    demolish(S, b);
    for (const [k, n] of Object.entries(bp(S, b).cost)) { const m = Math.floor(n * P.salvageShare); if (m > 0) add(store.inv, k, m); }
    return { spot, cut: b };
  }
  return null;
}

/**
 * Where to bridge: from a bank tile storage can walk to, straight across up to `max_span` tiles of open water to
 * land on the far side. Scores each span by the grass within `bridge_reach_tiles` of the far bank that cannot be walked to today
 * (`bridge_reach_weight` each), plus the tiles it would save on recent trips that went the long way round, less
 * `store_weight` times its distance from storage. The best span scoring at least `bridge_min_gain`, or null.
 */
export function chooseBridge(S: State, B: BlueprintDef, town: Town) {
  const P = T(S), W = S.world, store = S.bmap.get(town.store);
  if (!store || !B.bridge) return null;
  const from = door(store), reach = reachable(W, from.x, from.y), home = ctr(store), mine = mineOf(S, town);
  const R = Math.min(P.searchRadiusMax, Math.ceil(P.searchRadius + mine.reduce((m, b) => Math.max(m, hypot(ctr(b).x - home.x, ctr(b).y - home.y)), 0)));
  const bank = (i: number) => (W.ground[i] === 1 || W.ground[i] === 2) && W.bgrid[i] === -1 && !W.front[i];
  const open = (i: number) => !W.ground[i] && W.bgrid[i] === -1 && !W.bridge[i];
  const trips = town.detours.filter(t => S.t - t[5] < P.detourMemorySeconds);
  const bridges = S.buildings.filter(b => bp(S, b).bridge);
  let best: { x: number; y: number; w: number; h: number; from: { x: number; y: number }; to: { x: number; y: number } } | null = null, bs = P.bridgeMinGain;
  for (let y = Math.max(1, Math.floor(home.y - R)); y <= Math.min(W.h - 2, Math.ceil(home.y + R)); y++) for (let x = Math.max(1, Math.floor(home.x - R)); x <= Math.min(W.w - 2, Math.ceil(home.x + R)); x++) {
    const n = y * W.w + x;
    if (!reach[n] || !bank(n)) continue;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      let k = 1;
      while (k <= B.bridge.maxSpan && x + dx * k >= 0 && y + dy * k >= 0 && x + dx * k < W.w && y + dy * k < W.h && open((y + dy * k) * W.w + x + dx * k)) k++;
      const fx = x + dx * k, fy = y + dy * k;
      if (k === 1 || k > B.bridge.maxSpan + 1 || fx < 0 || fy < 0 || fx >= W.w || fy >= W.h || !bank(fy * W.w + fx)) continue;
      W.work.plannerSpots++;
      const span = k - 1;
      // crossings keep `bridge_spacing` apart: one bridge serves the stretch of water around it
      if (bridges.some(b => hypot(ctr(b).x - (x + fx) / 2, ctr(b).y - (y + fy) / 2) < P.bridgeSpacing)) continue;
      // land it opens: grass within 12 of the far bank that the bridge would connect and nobody can walk to yet
      const gain = reach[fy * W.w + fx] ? 0 : opensUp(W, fx, fy, reach, P.bridgeReachTiles);
      let s = P.bridgeReachWeight * gain;
      // a trip counts only for a span its straight line passes: the water it went round is here
      const mx = (x + fx) / 2 + 0.5, my = (y + fy) / 2 + 0.5;
      for (const t of trips) {
        if (segmentDist(mx, my, t[0] + 0.5, t[1] + 0.5, t[2] + 0.5, t[3] + 0.5) > P.bridgeTripTiles) continue;
        const via = Math.min(hypot(t[0] - x, t[1] - y) + span + hypot(fx - t[2], fy - t[3]), hypot(t[0] - fx, t[1] - fy) + span + hypot(x - t[2], y - t[3]));
        s += Math.max(0, t[4] - via);
      }
      s -= P.storeWeight * hypot(x - home.x, y - home.y);
      if (s > bs) {
        bs = s;
        const sx = Math.min(x + dx, x + dx * span), sy = Math.min(y + dy, y + dy * span);
        best = { x: sx, y: sy, w: dx ? span : 1, h: dy ? span : 1, from: { x, y }, to: { x: fx, y: fy } };
      }
    }
  }
  return best;
}

/** Distance from a point to a line segment. */
function segmentDist(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
  const t = L ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L)) : 0;
  return hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** Grass tiles reachable on foot from (x, y) within `r` tiles of it, through land not already in `reach`. */
function opensUp(W: World, x: number, y: number, reach: Uint8Array, r: number): number {
  const seen = new Set<number>([y * W.w + x]), q = [y * W.w + x];
  let grass = 0;
  while (q.length) {
    const i = q.pop()!, cx = i % W.w, cy = (i / W.w) | 0;
    if (W.ground[i] === 2) grass++;
    for (const j of [cx > 0 ? i - 1 : -1, cx < W.w - 1 ? i + 1 : -1, i - W.w, i + W.w]) {
      if (j < 0 || j >= W.ground.length || seen.has(j) || reach[j]) continue;
      const jx = j % W.w, jy = (j / W.w) | 0;
      if (!W.ground[j] || W.ground[j] === 3 || W.bgrid[j] !== -1 || hypot(jx - x, jy - y) > r) continue;
      seen.add(j); q.push(j);
    }
  }
  return grass;
}
