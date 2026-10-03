import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../src/content/node.ts';
import { bp, createState, ctr, door, findPath, loadGame, placeBuilding, runFor, saveGame, villagers } from '../src/sim/index.ts';
import { bestRoad, layRoad, planRoads, roadByCentre, traffic } from '../src/sim/roads.ts';

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
  const S = createState(content, 1847, { planner: true, plannedRoads: true });
  runFor(S, 1100);
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
  runFor(S, 1100);
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
  const S = createState(content, 1847, { planner: true, plannedRoads: true });
  runFor(S, 1100);
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
