import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../src/content/node.ts';
import { bp, canPlace, createState, ctr, door, findPath, loadGame, placeBuilding, runFor, saveGame, villagers } from '../src/sim/index.ts';
import { bestRoad, layRoad, planRoads, roadByCentre, traffic } from '../src/sim/roads.ts';
import { fits } from '../src/sim/place.ts';
import { centre, findSpot } from '../src/gates/kit.ts';

const content = loadContent();
const L = content.tuning.logistics;

test('planned roads are off unless asked for: no traffic strain, no roads', () => {
  const S = createState(content, 1847, { planner: true });
  runFor(S, 900);
  assert.equal(S.plannedRoads, false);
  S.towns[0].reach = 100; S.towns[0].form = 'village';
  assert.equal(traffic(S, S.towns[0]), 0);
  assert.equal(S.world.roads, 0);
});

test('paths and roads: a road is faster than a path, and routes take it', () => {
  const S = createState(content, 1847, {});
  const W = S.world;
  assert.ok(W.roadCost < W.pathCost && W.pathCost < 1);
  assert.equal(W.pathCost, 1 / L.pathSpeed);
  // a row of open land, laid half as path and half as road by hand
  const y = Math.floor(ctr(S.bmap.get(S.towns[0].store)!).y) + 6;
  const xs: number[] = [];
  for (let x = 0; x < W.w; x++) { const i = y * W.w + x; if (W.ground[i] === 2 && W.bgrid[i] === -1) xs.push(x); }
  assert.ok(xs.length > 10);
  placeBuilding(S, 'path', xs[0], y, false); placeBuilding(S, 'road', xs[1], y, false);
  assert.equal(W.road[y * W.w + xs[0]], 1); assert.equal(W.road[y * W.w + xs[1]], 2);
  assert.equal(W.roads, 1, 'the world counts its road tiles');
  // a road may be laid over a path, never a path over a road
  placeBuilding(S, 'road', xs[0], y, false);
  assert.equal(W.road[y * W.w + xs[0]], 2); assert.equal(W.roads, 2);
});

test('a village under traffic strain lays a straight road by its first yard, moving people and salvaging what it clears', () => {
  // roads turned on only now, so none was laid while the village grew
  const S = createState(content, 1847, { planner: true });
  runFor(S, 1100);
  S.plannedRoads = true;
  const t = S.towns[0];
  t.knows.road ??= { by: t.name, at: S.t, verified: [], from: null, learned: S.t, used: S.t };
  assert.notEqual(t.form, 'hamlet');
  const run = bestRoad(S, t);
  assert.ok(run, 'a run worth laying');
  assert.ok(run!.x0 === run!.x1 || run!.y0 === run!.y1, 'straight');
  const before = villagers(S).length, cut = run!.cut.length;
  layRoad(S, t, run!);
  assert.ok(run!.tiles.every(i => S.world.road[i] === 2));
  assert.ok(roadByCentre(S, t), 'it passes by the first yard');
  assert.equal(villagers(S).length, before, 'nobody left');
  assert.equal(S.stats.demolitionDepartures, 0);
  assert.equal(S.stats.roadCut, cut);
  assert.ok(S.chronicle.some(c => c.kind === 'road'));
});

test('roads are laid at a cost a tile, only by villages and towns that know them, and kept in mind while they stand', () => {
  const S = createState(content, 7, { planner: true, plannedRoads: true });
  const t = S.towns[0];
  assert.equal(planRoads(S, t, 1e9), false, 'a hamlet that does not know the road lays none');
  // roads off while the village grows, so none is laid before the test
  S.plannedRoads = false;
  runFor(S, 1100);
  S.plannedRoads = true;
  t.knows.road ??= { by: t.name, at: S.t, verified: [], from: null, learned: S.t, used: S.t };
  const yard = S.bmap.get(t.store)!; yard.inv.planks = 0;
  for (const b of S.buildings) if (bp(S, b).storage) b.inv.planks = 0;
  assert.equal(planRoads(S, t, 1e9), false, 'nothing to pay with');
  assert.match(t.planner.status, /Saving planks for a road/);
  yard.inv.planks = 500;
  assert.equal(planRoads(S, t, 1e9), true);
  const tiles = S.stats.roadTiles;
  assert.equal(yard.inv.planks >= 500 - tiles * content.blueprints.road.cost.planks, true);
  const was = t.knows.road.used = S.t - 100;
  runFor(S, 10);
  assert.ok(t.knows.road.used > was, 'roads in use keep the knowledge alive');
});

test('deliveries count the tiles they walk on roads and paths', () => {
  const S = createState(content, 1847, { planner: true, plannedRoads: true });
  runFor(S, 300);
  assert.ok(S.stats.pathDeliveries > 0);
  const a = S.agents.find(x => x.task)!;
  assert.ok(a && a.task!.steps >= a.task!.road + a.task!.path);
});

test('a game with roads saves and loads and plays on the same', () => {
  // roads turned on only now, so none was laid while the village grew
  const S = createState(content, 1847, { planner: true });
  runFor(S, 1100);
  S.plannedRoads = true;
  const t = S.towns[0];
  t.knows.road ??= { by: t.name, at: S.t, verified: [], from: null, learned: S.t, used: S.t };
  layRoad(S, t, bestRoad(S, t)!);
  const L2 = loadGame(content, JSON.stringify(saveGame(S)));
  assert.equal(L2.world.roads, S.world.roads); assert.deepEqual(L2.towns[0].roads, t.roads);
  runFor(S, 120); runFor(L2, 120);
  assert.equal(JSON.stringify(saveGame(L2)), JSON.stringify(saveGame(S)));
  const d = door(S.bmap.get(t.store)!);
  assert.ok(findPath(S.world, d.x, d.y + 1, d.x, d.y + 2) !== null);
});

test('a door may open straight onto a planned road, never onto a worn path, and nothing stands on either', () => {
  const S = createState(content, 1847, { planner: true, plannedRoads: true });
  const W = S.world, at = findSpot(S, 'sawmill', centre(S), 20)!;
  const B = content.blueprints.sawmill, front = (at.y + B.h) * W.w + at.x + Math.floor(B.w / 2);
  assert.ok(fits(S, 'sawmill', at.x, at.y));
  W.road[front] = 2;
  assert.ok(fits(S, 'sawmill', at.x, at.y), 'a road in its ring');
  W.road[front] = 1;
  assert.ok(!fits(S, 'sawmill', at.x, at.y), 'a path in its ring');
  W.road[front] = 0; W.road[at.y * W.w + at.x] = 2;
  assert.ok(!fits(S, 'sawmill', at.x, at.y), 'a road under it');
});

test('with seasons, a road laid in autumn or winter cuts through no workplace of the food chain', () => {
  const S = createState(content, 1847, { planner: true });
  runFor(S, 1100);
  S.plannedRoads = true;
  const t = S.towns[0];
  t.knows.road ??= { by: t.name, at: S.t, verified: [], from: null, learned: S.t, used: S.t };
  const food = (b: { type: string }) => Object.keys(content.blueprints[b.type].output).some(g => ['wheat', 'bread', 'fish', 'smoked_fish'].includes(g));
  const any = bestRoad(S, t)!;
  assert.ok(any);
  S.seasons = true;
  S.t = Math.ceil(S.t / content.tuning.seasons.yearSeconds) * content.tuning.seasons.yearSeconds + content.tuning.seasons.yearSeconds * 0.8;
  const winter = bestRoad(S, t);
  assert.ok(!winter || !winter.cut.some(food), 'nothing that feeds the village comes down in winter');
});

test('roads of stone: faster still, laid by hand over a road, and repaved by a settlement with stone to spare', () => {
  const S = createState(content, 1847, { planner: true });
  const W = S.world;
  assert.ok(W.stoneCost < W.roadCost, 'a road of stone is quicker than a road');
  assert.equal(W.stoneCost, 1 / L.stoneRoadSpeed);
  // by hand: stone over a road, never a road over stone
  const y = Math.floor(ctr(S.bmap.get(S.towns[0].store)!).y) + 6;
  const xs: number[] = [];
  for (let x = 0; x < W.w; x++) { const i = y * W.w + x; if (W.ground[i] === 2 && W.bgrid[i] === -1) xs.push(x); }
  placeBuilding(S, 'road', xs[0], y, false);
  placeBuilding(S, 'stone_road', xs[0], y, false);
  assert.equal(W.road[y * W.w + xs[0]], 3);
  assert.equal(W.roads, 1); assert.equal(W.stone, 1);
  assert.ok(!canPlace(S, 'road', xs[0], y) && !canPlace(S, 'stone_road', xs[0], y), 'nothing over stone');
  assert.ok(canPlace(S, 'stone_road', xs[1], y), 'stone on open ground');

  // a village with a road, the stone road known and stone to spare repaves the road whole
  const V = createState(content, 7, { planner: true, plannedRoads: true });
  V.plannedRoads = false;
  runFor(V, 1100);
  V.plannedRoads = true;
  const t = V.towns[0], yard = V.bmap.get(t.store)!;
  t.knows.road ??= { by: t.name, at: V.t, verified: [], from: null, learned: V.t, used: V.t };
  yard.inv.planks = 500;
  assert.equal(planRoads(V, t, 1e9), true, 'a road first');
  const strip = V.world.road.reduce((n, v) => n + (v === 2 ? 1 : 0), 0);
  // it has all the roads it wants: with no stone road known, it does nothing more
  t.roads.push(...Array.from({ length: 5 }, () => t.roads[0]));
  yard.inv.stone = 0;
  t.knows.stone_road = { by: t.name, at: V.t, verified: [], from: null, learned: V.t, used: V.t };
  assert.equal(planRoads(V, t, 1e9), false, 'no stone to spare');
  yard.inv.stone = strip + content.tuning.production.surplusMin;
  // (the stores are counted once a tick)
  V.t += 0.1;
  assert.equal(planRoads(V, t, 1e9), true);
  assert.equal(V.world.stone, strip);
  assert.equal(yard.inv.stone, content.tuning.production.surplusMin);
  assert.ok(V.chronicle.some(c => c.kind === 'road' && c.text.includes('in stone')));
});
