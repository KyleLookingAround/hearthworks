import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../src/content/node.ts';
import { createState, findPath, placeBuilding, runFor, ctr, type State } from '../src/sim/index.ts';
import { placeBridge, completeSite } from '../src/sim/buildings.ts';
import { surroundings, homesInNuisance } from '../src/sim/surroundings.ts';
import { findSpot } from '../src/gates/kit.ts';

const content = loadContent();

test('terrain: heights on land, rock on mountain maps only, deposits in the ground', () => {
  const S = createState(content, 7, { map: 'landmass', size: 'standard' }), w = S.world;
  let rock = 0, high = 0, deps = 0;
  for (let i = 0; i < w.ground.length; i++) { if (w.ground[i] === 3) rock++; if (w.height[i] > 0) high++; if (w.deposit[i]) deps++; assert.ok(w.ground[i] || w.height[i] === 0, 'water has no height'); }
  assert.ok(rock > 0, 'a landmass has mountains'); assert.ok(high > 0); assert.ok(deps > 0);
  const I = createState(content, 7, {}).world;
  assert.ok(!I.ground.some(g => g === 3), 'no mountains on the lone isle');
});

test('deposits come from their own random stream: settlements start where they did', () => {
  const a = createState(content, 42, { settlements: 2 });
  const b = structuredClone(content); b.maps.island.deposits = { fertile: 0, stone: 0, clay: 0, fish: 0, iron: 0 };
  const c = createState(b, 42, { settlements: 2 });
  assert.deepEqual(a.towns.map(t => t.store), c.towns.map(t => t.store));
  assert.deepEqual([...a.world.ground], [...c.world.ground]);
});

test('climbing costs time: route finding climbs no more than the flat route would', () => {
  const S = createState(content, 1847, {}), w = S.world;
  const flat = structuredClone(S.world); flat.height.fill(0);
  // the same start and end, near the island's middle
  const d = ctr(S.bmap.get(S.towns[0].store)!), sx = Math.floor(d.x) - 8, sy = Math.floor(d.y) + 4;
  const p = findPath(w, sx, sy, sx + 12, sy), q = findPath(flat, sx, sy, sx + 12, sy);
  assert.ok(p && q);
  const cost = (W: typeof w, path: [number, number][]) => path.reduce((s, [x, y], k) => { const [px, py] = k ? path[k - 1] : [sx, sy]; return s + Math.abs(W.height[y * W.w + x] - W.height[py * W.w + px]); }, 0);
  assert.ok(cost(w, p!) <= cost(w, q!) + 1e-9, 'route finding prefers the flatter way when there is one');
});

test('a bridge is walked once built, and not before', () => {
  const S = createState(content, 1847, { map: 'landmass', size: 'standard' }), w = S.world;
  // find a straight run of 3 water tiles between land
  let span: { x: number; y: number } | null = null;
  for (let y = 2; y < w.h - 2 && !span; y++) for (let x = 2; x < w.w - 6 && !span; x++) {
    const i = y * w.w + x;
    if (w.ground[i] && !w.ground[i + 1] && !w.ground[i + 2] && !w.ground[i + 3] && w.ground[i + 4] && w.bgrid[i] === -1 && w.bgrid[i + 4] === -1 && w.ground[i] !== 3 && w.ground[i + 4] !== 3) span = { x, y };
  }
  assert.ok(span, 'the landmass has a narrow channel');
  const { x, y } = span!;
  const b = placeBridge(S, x + 1, y, 3, 1, { x, y }, { x: x + 4, y }, 0);
  assert.ok(!w.bridge[y * w.w + x + 2], 'a site is not walkable');
  completeSite(S, b, false);
  for (let k = 1; k <= 3; k++) assert.equal(w.bridge[y * w.w + x + k], 1);
  const p = findPath(w, x, y, x + 4, y);
  assert.ok(p && p.length <= 6, 'straight over the bridge');
});

test('homes near a sawmill lose surroundings, and the planner keeps them apart', () => {
  const S = createState(content, 1847, {});
  const home = S.buildings.find(b => b.type === 'house')!;
  const before = surroundings(S, home).score;
  const at = findSpot(S, 'sawmill', ctr(home), 6)!;
  placeBuilding(S, 'sawmill', at.x, at.y, true);
  assert.ok(surroundings(S, home).score < before, 'the saw is loud');
  const P = createState(content, 42, { planner: true });
  runFor(P, 900);
  assert.equal(homesInNuisance(P), 0);
});

test('feet wear paths, and a planning village paves the worn ones', () => {
  const run = (roads: boolean) => { const S = createState(content, 7, { planner: true, roads }); runFor(S, 600); return S; };
  const on = run(true), off = run(false);
  const roads = (S: State) => S.world.road.reduce((n, r) => n + r, 0);
  assert.ok(on.world.wear.some(v => v > 0), 'feet wore the ground');
  assert.ok(roads(on) > roads(off) + 20, `paved ${roads(on)} vs ${roads(off)}`);
  assert.ok(on.stats.delivered > 0 && on.stats.deliveryTiles > 0);
});
