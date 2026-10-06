/**
 * Farms that grow (Phase 22). A workplace whose blueprint `grows` grows a size at a time: new fields, one row deep
 * across its back, are laid as a site of their own and become part of it when finished, with a place for one more
 * hand. Homes eat a varied diet of the foods their settlement grows. All of it only with `S.farms` on.
 */
import { bp, chronicle, door, emit, inB } from './core.ts';
import { placeBuilding } from './buildings.ts';
import { reachable, reshaped } from './path.ts';
import { sealsOff } from './place.ts';
import { ZONES, type BlueprintDef, type Building, type ItemId, type State, type Town } from './types.ts';

const NOBUILD = 1 + ZONES.indexOf('nobuild'), FARMS = 1 + ZONES.indexOf('farms');
const article = (name: string) => (/^[aeiou]/i.test(name) ? 'an' : 'a');

/** Does this blueprint exist in this world? Those of an option (farms that grow) only with it on. */
export const offered = (S: State, B: BlueprintDef) => !B.option || (B.option === 'farms' && S.farms) || (B.option === 'ships' && S.ships);

/** The largest size a blueprint grows to (0 for one that does not grow). */
export const maxSize = (B: BlueprintDef) => (B.grows ? B.grows.names.length - 1 : 0);

/** What a building is called at its size: a smallholding, a farm, an estate. */
export function sizeName(S: State, b: Building): string {
  const B = bp(S, b);
  return S.farms && B.grows ? B.grows.names[Math.min(b.size, maxSize(B))] : B.name;
}

/** Places for hands: the blueprint's workers, and one more for each step it has grown. */
export const places = (S: State, b: Building) => { const B = bp(S, b); return B.workers ? B.workers + b.size : 0; };

/** How much of its output a workplace holds before it stands full: `output_cap` for each place for a hand. */
export const capOf = (S: State, b: Building) => S.content.tuning.logistics.outputCap * Math.max(1, places(S, b));

/** Everyone working a building: its first hand, then the rest. */
export const crew = (b: Building): number[] => (b.worker === null ? [] : [b.worker, ...b.hands]);

/** Take one hand off a building's crew; the next hand becomes its first. */
export function leave(b: Building, id: number) {
  if (b.worker === id) b.worker = b.hands.shift() ?? null;
  else b.hands = b.hands.filter(h => h !== id);
}

/** An orchard whose young trees do not bear yet. */
export const unripe = (S: State, b: Building) => { const R = bp(S, b).ripens; return R > 0 && b.plantT < R; };

/** The strip behind a building: one row deep, as wide as its back (opposite its door). */
export function strip(b: Building): { x: number; y: number; w: number; h: number } {
  switch (b.rot) {
    case 1: return { x: b.x + b.w, y: b.y, w: 1, h: b.h };
    case 2: return { x: b.x, y: b.y + b.h, w: b.w, h: 1 };
    case 3: return { x: b.x - 1, y: b.y, w: 1, h: b.h };
    default: return { x: b.x, y: b.y - 1, w: b.w, h: 1 };
  }
}

/** The new fields site's door front: the middle of the strip's far side, one step beyond it. */
function fieldFront(b: Building): { x: number; y: number } {
  const s = strip(b);
  switch (b.rot) {
    case 1: return { x: s.x + 1, y: s.y + s.h - 1 - Math.floor(s.h / 2) };
    case 2: return { x: s.x + Math.floor(s.w / 2), y: s.y + 1 };
    case 3: return { x: s.x - 1, y: s.y + Math.floor(s.h / 2) };
    default: return { x: s.x + s.w - 1 - Math.floor(s.w / 2), y: s.y - 1 };
  }
}

/**
 * Why this building cannot grow a size now, or null if it can. The strip behind it must be open land (no building,
 * road, door front or no-build zone; for the planner, `zoned`, no other kind's zone) with a ring of open land beyond
 * it, the new fields' door front open, and laying it must cut no door off from the settlement's first storage yard.
 */
export function growProblem(S: State, b: Building, zoned = false): string | null {
  const B = bp(S, b), W = S.world;
  if (!S.farms || !B.grows) return 'it does not grow';
  if (b.site) return 'it is still being built';
  if (b.size >= maxSize(B)) return `it is ${article(sizeName(S, b))} ${sizeName(S, b).toLowerCase()}, as big as it grows`;
  if (S.buildings.some(o => o.of === b.id)) return 'its new fields are being laid';
  W.work.plannerSpots++;
  const s = strip(b);
  for (let j = s.y; j < s.y + s.h; j++) for (let k = s.x; k < s.x + s.w; k++) {
    if (!inB(W, k, j)) return 'the edge of the map is behind it';
    const i = j * W.w + k;
    if (!W.ground[i]) return 'there is water behind it';
    if (W.ground[i] === 3) return 'there is bare rock behind it';
    if (W.bgrid[i] !== -1) return 'something is built behind it';
    if (W.road[i]) return `there is a ${W.road[i] >= 2 ? 'road' : 'path'} behind it`;
    if (W.front[i]) return "it would block another building's door";
    if (W.zone[i] === NOBUILD) return 'the land behind it is kept free of building';
    if (zoned && W.zone[i] !== 0 && W.zone[i] !== FARMS) return 'the land behind it is zoned for something else';
  }
  for (let j = s.y - 1; j <= s.y + s.h; j++) for (let k = s.x - 1; k <= s.x + s.w; k++) {
    if (!inB(W, k, j)) continue;
    const id = W.bgrid[j * W.w + k];
    if (id !== -1 && id !== b.id) return 'it would wall in its neighbours';
  }
  const f = fieldFront(b);
  if (!inB(W, f.x, f.y) || !W.ground[f.y * W.w + f.x]) return 'there would be no way to the new fields';
  const store = S.bmap.get(S.towns[b.town]?.store ?? -1);
  if (store) {
    const from = door(store), reach = reachable(W, from.x, from.y), doors: number[] = [];
    for (const o of S.buildings) if (!o.dead && !bp(S, o).bridge) { const dd = door(o), i = dd.y * W.w + dd.x; if (reach[i]) doors.push(i); }
    if (sealsOff(W, s.x, s.y, s.w, s.h, from, doors, f.y * W.w + f.x)) return 'it would cut off a door';
  }
  return null;
}

/** The blueprint of new fields. */
export const fieldType = (S: State) => Object.values(S.content.blueprints).find(B => B.field)!;

/** Lay new fields behind a building to grow it a size: a site facing away from it. Null when it cannot grow. */
export function growFarm(S: State, b: Building, zoned = false): Building | null {
  if (growProblem(S, b, zoned)) return null;
  const s = strip(b), f = placeBuilding(S, fieldType(S).id, s.x, s.y, false, (b.rot + 2) % 4, { w: s.w, h: s.h })!;
  f.town = b.town; f.of = b.id;
  f.reason = `to grow ${article(sizeName(S, b))} ${sizeName(S, b).toLowerCase()} into ${article(bp(S, b).grows!.names[b.size + 1])} ${bp(S, b).grows!.names[b.size + 1].toLowerCase()}`;
  return f;
}

/** Finished new fields join their farm: the strip becomes part of it, and it is one size bigger. */
export function joinFields(S: State, f: Building, farm: Building | undefined, announce: boolean) {
  const W = S.world;
  if (!farm || farm.dead) { for (let j = f.y; j < f.y + f.h; j++) for (let k = f.x; k < f.x + f.w; k++) W.bgrid[j * W.w + k] = -1; reshaped(W); return; }
  const x0 = Math.min(farm.x, f.x), y0 = Math.min(farm.y, f.y), x1 = Math.max(farm.x + farm.w, f.x + f.w), y1 = Math.max(farm.y + farm.h, f.y + f.h);
  const was = sizeName(S, farm);
  farm.x = x0; farm.y = y0; farm.w = x1 - x0; farm.h = y1 - y0;
  for (let j = f.y; j < f.y + f.h; j++) for (let k = f.x; k < f.x + f.w; k++) W.bgrid[j * W.w + k] = farm.id;
  farm.size++; S.stats.grown++;
  const now = sizeName(S, farm), town = S.towns[farm.town];
  if (announce) emit(S, 'good', town && S.towns.length > 1 ? `${town.name}: ${article(was)} ${was.toLowerCase()} grew into ${article(now)} ${now.toLowerCase()}` : `${article(was).replace(/^a/, 'A')} ${was.toLowerCase()} grew into ${article(now)} ${now.toLowerCase()}`, true);
  if (town && farm.size === maxSize(bp(S, farm))) chronicle(S, town.id, 'farm', `${town.name} grew ${article(bp(S, farm).name)} ${bp(S, farm).name.toLowerCase()} into ${article(now)} ${now.toLowerCase()}`);
}

/** The diet foods a settlement's homes can get: what one of its finished workplaces makes, or its stores hold. Counted once a tick. */
const diets = new WeakMap<State, { t: number; by: Map<number, Set<ItemId>> }>();
export function dietOf(S: State, town: number): Set<ItemId> {
  let c = diets.get(S);
  if (!c || c.t !== S.t) { c = { t: S.t, by: new Map() }; diets.set(S, c); }
  let out = c.by.get(town);
  if (out) return out;
  const diet = S.content.tuning.farms.diet;
  out = new Set();
  for (const b of S.buildings) {
    if (b.town !== town || b.site) continue;
    const B = bp(S, b);
    for (const g of diet) if (B.output[g] || (B.storage && (b.inv[g] || 0) >= 1)) out.add(g);
  }
  c.by.set(town, out);
  return out;
}

/**
 * What a home eats next: with farms that grow on, of the foods it has, the one it has gone longest without
 * (its preserved food only when nothing else is left); otherwise the first of its foods it has.
 */
export function mealOf(S: State, b: Building, foods: ItemId[]): ItemId | undefined {
  if (!S.farms) return foods.find(f => (b.inv[f] || 0) >= 1);
  const kept = S.content.tuning.seasons.preserved;
  let best: ItemId | undefined, bt = Infinity;
  for (const f of foods) {
    if (kept.includes(f) || (b.inv[f] || 0) < 1) continue;
    const t = b.ate[f] ?? -Infinity;
    if (t < bt) { bt = t; best = f; }
  }
  return best ?? foods.find(f => (b.inv[f] || 0) >= 1);
}

/** How many foods a home has eaten in the last `diet_seconds`. */
export function foodsEaten(S: State, b: Building, within = S.content.tuning.farms.dietSeconds): number {
  let n = 0;
  for (const f in b.ate) if (S.t - b.ate[f] <= within) n++;
  return n;
}

/** A varied diet's lift to a home's mood: up to `diet_bonus`, all of it at `diet_full` foods. */
export const dietLift = (S: State, b: Building) => {
  const F = S.content.tuning.farms;
  return S.farms ? F.dietBonus * Math.max(0, Math.min(1, (foodsEaten(S, b) - 1) / Math.max(1, F.dietFull - 1))) : 0;
};

/**
 * Of a settlement's workplaces of this kind, the one to grow: finished, able to grow now, the most grown first
 * (then the oldest), so one reaches its largest size before the next starts.
 */
export function toGrow(S: State, town: Town, B: BlueprintDef): Building | null {
  if (!S.farms || !B.grows) return null;
  const cands = S.buildings.filter(b => b.town === town.id && b.type === B.id && !b.site && b.size < maxSize(B)).sort((p, q) => q.size - p.size || p.id - q.id);
  return cands.find(b => !growProblem(S, b, true)) ?? null;
}
