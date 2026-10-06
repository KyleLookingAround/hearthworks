import { makeRng, rand, valueNoise, type Rng } from './rng.ts';
import { bp, ctr, door, hypot, inB } from './core.ts';
import { findPath, reachable } from './path.ts';
import { islesOf, shapeSea } from './sea.ts';
import type { MapDef, State, Town, World } from './types.ts';

/**
 * Generate a world of the given type and size. Island at the standard size reproduces the
 * original island exactly (same numbers, same random draws in the same order).
 */
export function generateWorld(M: MapDef, W: number, H: number, S: State): World {
  const r = S.rng, N = W * H, T = M.terrain, F = M.forest;
  const w: World = { w: W, h: H, ground: new Uint8Array(N), height: new Uint8Array(N), deposit: new Uint8Array(N), slopeCost: 0, rockCost: 1, pathCost: 1, roadCost: 1, stoneCost: 1, roads: 0, stone: 0, forestCost: 1, wear: new Float32Array(N), bridge: new Uint8Array(N), zone: new Uint8Array(N), tree: new Uint8Array(N), grow: new Float32Array(N), road: new Uint8Array(N), belt: new Uint8Array(N), belts: 0, bgrid: new Int32Array(N).fill(-1), door: new Uint8Array(N), front: new Uint8Array(N), dock: new Uint8Array(N), docks: 0, waterCost: 1, sea: new Uint8Array(N), shallowCost: 1, work: { paths: 0, pathFails: 0, pathNodes: 0, jobPairs: 0, plannerSpots: 0 } };
  const n1 = valueNoise(r, T.largeCell, W, H), n2 = valueNoise(r, T.smallCell, W, H), n3 = valueNoise(r, F.cell, W, H);
  // island centres for the islands shape, and islets out at sea: drawn only for maps that have them,
  // so the lone isle draws exactly the random numbers it always did
  const half = Math.min(W, H) / 2, blobs: { x: number; y: number; r: number }[] = [];
  if (M.shape === 'islands' && M.islands) {
    const I = M.islands;
    // islands keep their size on bigger maps; there are more of them, in proportion to the area
    const scale = Math.min(half, I.scaleTiles), more = Math.min(I.countCap, Math.max(1, (W * H) / (4 * scale * scale * 1.4)));
    const n = Math.round((I.countMin + Math.floor(rand(r) * (I.countMax - I.countMin + 1))) * (half > I.scaleTiles ? more : 1));
    for (let k = 0, tries = 0; k < n && tries < 400 * Math.max(1, n / I.countMax); tries++) {
      const rad = Math.min(half - 3, Math.max(I.minTiles, scale * (I.radiusMin + rand(r) * (I.radiusMax - I.radiusMin))));
      const bx = rad + 2 + rand(r) * (W - 2 * rad - 4), by = rad + 2 + rand(r) * (H - 2 * rad - 4);
      // keep a channel of sea between islands
      if (blobs.some(o => hypot(o.x - bx, o.y - by) < (o.r + rad) * 1.05)) continue;
      blobs.push({ x: bx, y: by, r: rad }); k++;
    }
  }
  for (let k = 0; k < M.islets; k++) {
    const rad = half * (0.08 + rand(r) * 0.08);
    const bx = W * (M.shape === 'coast' ? M.coastline + 0.12 + rand(r) * (0.82 - M.coastline) : rand(r)), by = rad + rand(r) * (H - 2 * rad);
    blobs.push({ x: bx, y: by, r: rad });
  }
  const nearestBlob = (x: number, y: number) => blobs.reduce((m, o) => Math.min(m, ((x + 0.5 - o.x) ** 2 + (y + 0.5 - o.y) ** 2) / (o.r * o.r)), Infinity);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, dx = (x + 0.5 - W / 2) / (W / 2), dy = (y + 0.5 - H / 2) / (H / 2), radial = dx * dx + dy * dy;
    let d = radial;
    if (M.shape === 'landmass') d = 0;
    else if (M.shape === 'coast') { const s = Math.max(0, (x + 0.5) / W - M.coastline) / (1 - M.coastline); d = s * s * 4; }
    else if (M.shape === 'islands') d = nearestBlob(x, y);
    if (M.islets && M.shape !== 'islands') d = Math.min(d, nearestBlob(x, y));
    let h = T.large * n1(x, y) + T.small * n2(x, y) + T.base - T.falloff * d;
    if (radial < M.start.landRadius) h = Math.max(h, 0.7);
    const border = x === 0 || y === 0 || x === W - 1 || y === H - 1;
    w.ground[i] = (border && M.shores.seaBorder) ? 0 : h > M.shores.grass ? 2 : h > M.shores.sand ? 1 : 0;
    if (w.ground[i]) w.height[i] = Math.max(0, Math.min(255, Math.round((h - M.shores.sand) * 320)));
    if (w.ground[i] === 2 && M.mountains && h > M.mountains.level) w.ground[i] = 3;
  }
  for (let k = 0; k < M.rivers.count; k++) carveRiver(w, r, M.rivers.width);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (w.ground[i] === 2 && ((n3(x, y) > F.threshold && rand(r) < F.density) || rand(r) < F.scatter)) w.tree[i] = 2;
  }
  for (let i = 0; i < N; i++) if (!w.ground[i]) w.height[i] = 0;
  placeDeposits(w, M, S.seed);
  shapeSea(w, M, S.seed, S.content.tuning.sea);
  return w;
}

/**
 * Deposits from their own random stream (so adding them moved nothing else): fertile soil in patches of
 * grass, stone on and beside rock (outcrops where there are no mountains), clay on banks beside water,
 * and fish in water near land. Patches follow smooth noise, so they come in clumps.
 */
function placeDeposits(w: World, M: MapDef, seed: number) {
  const r = makeRng(seed ^ 0x6465706f), W = w.w, H = w.h, D = M.deposits;
  const soil = valueNoise(r, 7, W, H), rock = valueNoise(r, 5, W, H), mud = valueNoise(r, 4, W, H), shoal = valueNoise(r, 6, W, H), ore = valueNoise(r, 5, W, H);
  const near = (x: number, y: number, g: number, R: number) => {
    for (let j = -R; j <= R; j++) for (let k = -R; k <= R; k++) { const xx = x + k, yy = y + j; if (xx >= 0 && yy >= 0 && xx < W && yy < H && w.ground[yy * W + xx] === g) return true; }
    return false;
  };
  // a share `p` of tiles kept: noise above the matching level of a roughly even spread
  const keep = (v: number, p: number) => v > 1 - p;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, g = w.ground[i];
    if (g === 2 && keep(soil(x, y), D.fertile)) w.deposit[i] = 1;
    else if ((g === 3 || (g && near(x, y, 3, 1))) && keep(rock(x, y), M.mountains ? 0.6 : 0)) w.deposit[i] = 2;
    else if (g === 2 && !M.mountains && keep(rock(x, y), D.stone)) w.deposit[i] = 2;
    else if (g && g !== 3 && near(x, y, 0, 1) && keep(mud(x, y), D.clay)) w.deposit[i] = 3;
    else if (!g && near(x, y, 2, 3) && keep(shoal(x, y), D.fish)) w.deposit[i] = 4;
    // iron: veins in rock, and small outcrops in grass where there are no mountains (drawn last, so the rest stay put)
    if (((g === 3 && keep(ore(x, y), 0.3)) || (g === 2 && !M.mountains && keep(ore(x, y), D.iron))) && w.deposit[i] !== 4) w.deposit[i] = 5;
  }
}

/** A river from one edge of the map to the opposite one, wandering as it goes, with sandy banks. */
function carveRiver(w: World, r: Rng, width: number) {
  const across = rand(r) < 0.5, len = across ? w.w : w.h, span = across ? w.h : w.w;
  let pos = span * (0.2 + rand(r) * 0.6), drift = 0;
  for (let s = 0; s < len; s++) {
    drift = Math.max(-1, Math.min(1, drift + (rand(r) - 0.5) * 0.5));
    pos = Math.max(2, Math.min(span - 3, pos + drift));
    for (let o = -width; o <= width; o++) {
      const p = Math.round(pos) + o, x = across ? s : p, y = across ? p : s;
      if (!inB(w, x, y)) continue;
      const i = y * w.w + x;
      if (Math.abs(o) < width) w.ground[i] = 0;
      else if (w.ground[i] === 2) w.ground[i] = 1;
    }
  }
}

/** Ready a settlement's ground: a grove planted north-west of it so it can start a wood chain, and its centre cleared. */
/** Clear the trees off a new settlement's layout (a founding party's first work). */
export function clearSite(S: State, M: MapDef, cx: number, cy: number) {
  const w = S.world, W = w.w;
  for (let y = Math.max(0, cy - 8); y <= Math.min(w.h - 1, cy + 8); y++) for (let x = Math.max(0, cx - 8); x <= Math.min(W - 1, cx + 8); x++) {
    if (hypot(x + 0.5 - cx, (y + 0.5 - cy) * 1.2) < M.start.clearRadius) w.tree[y * W + x] = 0;
  }
}

export function prepareSite(S: State, M: MapDef, cx: number, cy: number) {
  const w = S.world, W = w.w;
  for (let y = cy - 8; y <= cy - 3; y++) for (let x = cx - 12; x <= cx - 6; x++) {
    const i = y * W + x;
    if (inB(w, x, y) && w.ground[i] === 2 && w.bgrid[i] === -1 && rand(S.rng) < M.forest.groveDensity) w.tree[i] = 2;
  }
  for (let y = Math.max(0, cy - 8); y <= Math.min(w.h - 1, cy + 8); y++) for (let x = Math.max(0, cx - 8); x <= Math.min(W - 1, cx + 8); x++) {
    if (hypot(x + 0.5 - cx, (y + 0.5 - cy) * 1.2) < M.start.clearRadius) w.tree[y * W + x] = 0;
  }
}

/** Running sums of a tile test over the map, so any rectangle's count is four lookups. Out-of-map tiles count 0. */
function sums(w: World, test: (i: number) => boolean) {
  const W = w.w + 1, t = new Int32Array(W * (w.h + 1));
  for (let y = 0; y < w.h; y++) for (let x = 0, row = 0; x < w.w; x++) { row += test(y * w.w + x) ? 1 : 0; t[(y + 1) * W + x + 1] = t[y * W + x + 1] + row; }
  return (x0: number, y0: number, x1: number, y1: number) => {
    x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(w.w - 1, x1); y1 = Math.min(w.h - 1, y1);
    if (x0 > x1 || y0 > y1) return 0;
    return t[(y1 + 1) * W + x1 + 1] - t[y0 * W + x1 + 1] - t[(y1 + 1) * W + x0] + t[y0 * W + x0];
  };
}

/**
 * Site tests over the land as it is now: does the starting layout (storage, a house each side, a road) fit
 * around (cx, cy) on open grass with a margin; grass within 8 (room to grow); grown trees within 10 (wood
 * close enough to start a wood chain).
 */
function siteTests(w: World) {
  const open = sums(w, i => w.ground[i] === 2 && w.bgrid[i] === -1 && !w.road[i]);
  const grass = sums(w, i => w.ground[i] === 2), trees = sums(w, i => w.tree[i] === 2);
  return {
    layoutFits: (cx: number, cy: number) => cx - 6 >= 0 && cy - 2 >= 0 && cx + 5 < w.w && cy + 3 < w.h && open(cx - 6, cy - 2, cx + 5, cy + 3) === 72,
    roomAround: (cx: number, cy: number) => grass(cx - 8, cy - 8, cx + 8, cy + 8),
    woodAround: (cx: number, cy: number) => trees(cx - 10, cy - 10, cx + 10, cy + 10),
  };
}

/**
 * Where the first settlement starts, chosen by the seed. Each spot where the starting layout fits
 * scores its room to grow plus `start_wood_weight` per tree nearby; of the spots scoring at least
 * `start_room_share` of the best, the seed picks one.
 */
export function firstSite(S: State): { x: number; y: number } {
  const w = S.world, T = S.content.tuning.start, share = T.startRoomShare;
  const { layoutFits, roomAround, woodAround } = siteTests(w);
  const spots: { x: number; y: number; room: number }[] = [];
  let best = 0;
  for (let cy = 4; cy < w.h - 5; cy++) for (let cx = 8; cx < w.w - 7; cx++) {
    if (!layoutFits(cx, cy)) continue;
    const room = roomAround(cx, cy) + T.startWoodWeight * woodAround(cx, cy);
    spots.push({ x: cx, y: cy, room }); best = Math.max(best, room);
  }
  const good = spots.filter(s => s.room >= best * share);
  if (!good.length) return { x: Math.floor(w.w / 2), y: Math.floor(w.h / 2) };
  return good[Math.floor(rand(S.rng) * good.length)];
}

/**
 * Where a neighbour can settle, chosen by the seed: the whole starting layout on open grass,
 * at least `neighbour_min_distance` from every settlement, with `neighbour_min_room` to grow,
 * and reachable on foot unless the map allows neighbours across water. Spots count as far enough
 * apart when their distance to the nearest settlement (capped at `neighbour_spacing`) is at least
 * `neighbour_spread_share` of the best; of those, the seed picks one scoring at least
 * `start_room_share` of the best on room and wood, as for the first settlement.
 * Null if the land has no room.
 */
export function neighbourSite(S: State, from: Town = S.towns[0], reach = false, charted = false): { x: number; y: number } | null {
  const w = S.world, t = S.content.tuning.start;
  const centres = S.towns.map(tn => ctr(S.bmap.get(tn.store)!));
  const home = door(S.bmap.get(from.store)!);
  const { layoutFits, roomAround, woodAround } = siteTests(w);
  const spots: { x: number; y: number; spread: number; score: number }[] = [];
  for (let cy = 3; cy < w.h - 4; cy++) for (let cx = 7; cx < w.w - 6; cx++) {
    let d = Infinity;
    for (const c of centres) d = Math.min(d, hypot(cx - c.x, cy - c.y));
    if (d < t.neighbourMinDistance || !layoutFits(cx, cy)) continue;
    const room = roomAround(cx, cy);
    // never found a village where it has no room to live
    if (room < t.neighbourMinRoom) continue;
    spots.push({ x: cx, y: cy, spread: Math.min(d, t.neighbourSpacing), score: room + t.startWoodWeight * woodAround(cx, cy) });
  }
  // with `charted`, only on islands `from` has charted: a party chooses among the land it knows of
  const isle = charted ? islesOf(S).id : null, known = new Set(from.charted);
  const mapped = isle ? spots.filter(p => known.has(isle[(p.y + 1) * w.w + p.x])) : spots;
  const far = mapped.reduce((m, p) => Math.max(m, p.spread), 0) * t.neighbourSpreadShare;
  const apart = mapped.filter(p => p.spread >= far);
  const top = apart.reduce((m, p) => Math.max(m, p.score), 0) * t.startRoomShare;
  const good = apart.filter(p => p.score >= top);
  const onFoot = S.content.maps[S.setup.map].neighbours === 'reachable', test = onFoot || reach;
  // what can be walked to is found once; only with docks can a route search reach more (by boat), and a search
  // that fails covers the whole map, so without them the sites out of reach are never searched for
  const foot = test ? reachable(w, home.x, home.y) : null;
  const walks = (p: { x: number; y: number }) => !!foot && foot[(p.y + 1) * w.w + p.x] === 1;
  // with ships on, only the settlement's own docks launch its boats
  const docks = S.ships ? S.buildings.some(b => b.town === from.id && !b.site && bp(S, b).shore) : w.docks > 0;
  const left = test && !docks ? good.filter(walks) : good;
  while (left.length) {
    const k = Math.floor(rand(S.rng) * left.length), p = left[k];
    // with `reach`, the site must be reachable from `from`: on foot, or rowing from a dock
    if (!test || walks(p) || findPath(w, home.x, home.y, p.x, p.y + 1, S.ships ? { fleet: from.id } : {})) return { x: p.x, y: p.y };
    left.splice(k, 1);
  }
  return null;
}
