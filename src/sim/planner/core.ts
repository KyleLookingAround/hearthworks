/** What the planner's parts share: its tuning, what a settlement knows and has, the basics, its form, homes and districts. */
import { supplyOf } from '../logistics.ts';
import { bp, ctr, villagers, hypot } from '../core.ts';
import { foodChainOf } from '../production.ts';
import { places } from '../farms.ts';
import type { BlueprintDef, Building, Form, ItemId, State, Town } from '../types.ts';
import { caches } from '../caches.ts';

export const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
export const T = (S: State) => S.content.tuning.planner;
/** The blueprints this settlement knows, in build-bar order. */
export const known = (S: State, town: Town) => Object.values(S.content.blueprints).filter(B => B.id in town.knows).sort((a, b) => a.order - b.order);
export const mineOf = (S: State, town: Town) => S.buildings.filter(b => b.town === town.id);
/** Is a point within reach of a courier building's bots? */
export const covered = (S: State, p: { x: number; y: number }) => S.buildings.some(d => { const C = bp(S, d).couriers; return !!C && hypot(p.x - ctr(d).x, p.y - ctr(d).y) <= C.radius; });

/** Grown trees within `r` of a point, those already in another harvester's range counted at `shared` weight. */
export function treeScore(S: State, cx: number, cy: number, r: number, others: Building[], shared: number, memo?: Uint8Array): number {
  const W = S.world;
  let n = 0;
  // (only harvesters whose ground can overlap this circle can take a tree in it)
  if (!memo) others = others.filter(o => { const c = ctr(o); return hypot(c.x - cx, c.y - cy) <= bp(S, o).harvest!.radius + r + 1; });
  for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) {
    if (x < 0 || y < 0 || x >= W.w || y >= W.h || W.tree[y * W.w + x] !== 2) continue;
    if (hypot(x + 0.5 - cx, y + 0.5 - cy) > r) continue;
    // (whether another harvester reaches a tree is the same for every spot weighed against the same others: `memo` keeps it, 2 for taken)
    let m = memo ? memo[y * W.w + x] : 0;
    if (!m) { m = others.some(o => { const c = ctr(o), R = bp(S, o).harvest!.radius; return hypot(x + 0.5 - c.x, y + 0.5 - c.y) <= R; }) ? 2 : 1; if (memo) memo[y * W.w + x] = m; }
    n += m === 2 ? shared : 1;
  }
  return n;
}

/**
 * How much of its nominal rate a producer can deliver on its own trees. Inputs are
 * handled by the chain pass; a missing worker is a labour shortage, not a lack of
 * capacity, so an unstaffed building still counts.
 */
export function ownEffect(S: State, b: Building): number {
  const B = bp(S, b);
  if (!b.site && b.paused) return 0;
  if (B.harvest) {
    const c = ctr(b), harvesters = S.buildings.filter(o => o !== b && bp(S, o).harvest);
    return clamp01(treeScore(S, c.x, c.y, B.harvest.radius, harvesters, T(S).sharedTreeYield) / T(S).minTrees);
  }
  return 1;
}

/** The basics: the food chain, the building goods and, with seasons, firewood, with everything that goes into making them. */
export function basics(S: State): Set<ItemId> {
  const list = caches(S.world).basics;
  const hit = list.find(e => e.seasons === S.seasons);
  if (hit) return hit.set;
  const out = new Set<ItemId>([...foodChainOf(S), ...T(S).buildGoods, ...(S.seasons ? ['logs'] : [])]);
  for (let grew = true; grew;) {
    grew = false;
    for (const B of Object.values(S.content.blueprints)) if (Object.keys(B.output).some(g => out.has(g))) for (const i in B.input) if (!out.has(i)) { out.add(i); grew = true; }
  }
  list.push({ seasons: S.seasons, set: out });
  return out;
}

/**
 * Crowded: a wish has stood on the settlement's list with no room for it (its land is full for what it needs) for
 * `crowded_hold_seconds`. Settling reads this, not the planner's words.
 */
export function crowded(S: State, town: Town): boolean {
  const Q = town.planner;
  return Q.on && Q.roomSince !== null && S.t - Q.roomSince >= S.content.tuning.settling.crowdedHoldSeconds;
}

/**
 * Out of land for food: it found no room for a workplace of the food chain within twice `no_room_retry_seconds` (bread's
 * chain: an orchard with no fertile land in reach is no reason to stop growing).
 */
export function landless(S: State, town: Town): boolean {
  const chain = foodChainOf(S), diet = S.content.tuning.farms.diet;
  for (const id in town.planner.noRoom) if (S.t - town.planner.noRoom[id] < T(S).noRoomRetrySeconds * 2 && Object.keys(S.content.blueprints[id]?.output ?? {}).some(g => chain.has(g) && !diet.includes(g))) return true;
  return false;
}

const FORMS: Form[] = ['hamlet', 'village', 'town'];

/** A site that has waited `site_patience_seconds` for a good nobody in its settlement has. */
export function starved(S: State, b: Building, town: Town): boolean {
  if (!b.site) return false;
  const B = bp(S, b);
  return Object.keys(B.cost).some(k => (b.inv[k] || 0) < B.cost[k] && k in b.waiting && S.t - b.waiting[k] > T(S).sitePatienceSeconds && supplyOf(S, k, town.id) <= 0);
}

/** A settlement's form, by its people: a hamlet, a village from `village_at`, a town from `town_at`. */
export function formOf(S: State, town: Town): Form {
  const pop = villagers(S).filter(a => a.home?.town === town.id).length, P = T(S);
  return pop >= P.townAt ? 'town' : pop >= P.villageAt ? 'village' : 'hamlet';
}

/**
 * The densest home the settlement knows and its form allows: the rung of the ladder it builds now.
 * With `afford`, the densest of those it can pay for today (a home built to bring a worker must not wait on the work).
 */
export function homeFor(S: State, town: Town, afford = false): BlueprintDef | undefined {
  const f = FORMS.indexOf(formOf(S, town));
  const homes = known(S, town).filter(B => B.homes && FORMS.indexOf(B.form) <= f).sort((a, b) => b.homes / (b.w * b.h) - a.homes / (a.w * a.h) || b.homes - a.homes);
  return afford ? homes.find(B => !affordable(S, B, town)) ?? homes[homes.length - 1] : homes[0];
}

/** The storage yards at the heart of a settlement's districts, first district first. */
export function hubs(S: State, town: Town): Building[] {
  return town.districts.map(id => S.bmap.get(id)).filter((b): b is Building => !!b && !b.dead);
}

/** The buildings of one district: those nearer its centre than any other district's. */
export function members(S: State, town: Town, hub: Building): Building[] {
  const hs = hubs(S, town), c = ctr(hub);
  return mineOf(S, town).filter(b => { const p = ctr(b), d = hypot(p.x - c.x, p.y - c.y); return hs.every(o => o === hub || hypot(p.x - ctr(o).x, p.y - ctr(o).y) >= d); });
}

/** How far a district reaches from its centre: `search_radius` beyond its farthest building, at most `search_radius_max`. */
export function reachOf(S: State, town: Town, hub: Building): number {
  const P = T(S), c = ctr(hub);
  return Math.min(P.searchRadiusMax, Math.ceil(P.searchRadius + members(S, town, hub).reduce((m, b) => Math.max(m, hypot(ctr(b).x - c.x, ctr(b).y - c.y)), 0)));
}

/** The first good this blueprint costs that the settlement cannot pay for yet, and how much it is short. */
export function affordable(S: State, B: BlueprintDef, town: Town): { good: ItemId; short: number } | null {
  for (const k in B.cost) {
    let owed = 0;
    for (const b of S.buildings) if (b.site && b.town === town.id) owed += Math.max(0, (bp(S, b).cost[k] || 0) - (b.inv[k] || 0) - (b.incoming[k] || 0));
    const free = supplyOf(S, k, town.id) - owed;
    // with nothing yet making this good, keep back enough to build what makes it: never spend the last planks before a sawmill
    const makers = known(S, town).filter(M => M.output[k]);
    const keep = !B.output[k] && makers.length && !S.buildings.some(b => b.town === town.id && bp(S, b).output[k]) ? Math.min(...makers.map(M => M.cost[k] || 0)) : 0;
    if (free - keep < B.cost[k]) return { good: k, short: B.cost[k] + keep - free };
  }
  return null;
}

/** The district centre a building stands in: a storage yard at a district's heart within `centre_radius` of it. */
export function centreOf(S: State, town: Town, b: Building): Building | undefined {
  const r = T(S).centreRadius, c = ctr(b);
  return hubs(S, town).find(h => h !== b && Math.hypot(ctr(h).x - c.x, ctr(h).y - c.y) <= r);
}

/** What a building adds to its settlement's supply of a good a second, at the share its own trees allow. */
export function shareOf(S: State, b: Building, g: ItemId): number {
  const B = bp(S, b);
  return B.seconds && B.output[g] ? (B.output[g] / B.seconds) * ownEffect(S, b) * places(S, b) : 0;
}
