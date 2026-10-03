import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../src/content/node.ts';
import { createState, door, findPath, placeBuilding, placeProblem, runFor, type State } from '../src/sim/index.ts';
import { centre, findSpot } from '../src/gates/kit.ts';

const content = loadContent();
/** Agents standing on a building tile that is not a door. */
const insideWalls = (S: State) => S.agents.filter(a => {
  const w = S.world, i = Math.floor(a.y) * w.w + Math.floor(a.x);
  return w.bgrid[i] !== -1 && !w.door[i];
}).length;

test('paths go around buildings and enter only by the door', () => {
  const S = createState(content, 1847);
  const store = S.bmap.get(S.towns[0].store)!, d = door(store), w = S.world;
  const p = findPath(w, d.x - 6, d.y + 2, d.x, d.y)!;
  assert.ok(p.length > 0);
  for (const [x, y] of p) { const i = y * w.w + x; assert.ok(w.bgrid[i] === -1 || w.door[i], `stepped on a wall at ${x},${y}`); }
  // straight through the storage yard is not allowed: from above it, the way round is longer than the way through
  const above = findPath(w, d.x, store.y - 2, d.x, d.y)!;
  assert.ok(above.length > store.h + 1);
});

test("placement keeps every door's front open", () => {
  const S = createState(content, 1847);
  const store = S.bmap.get(S.towns[0].store)!, d = door(store);
  assert.match(placeProblem(S, 'house', d.x - 1, d.y + 1) ?? '', /block another building's door/);
  const c = centre(S), at = findSpot(S, 'house', { x: c.x + 8, y: c.y + 8 })!;
  assert.equal(placeProblem(S, 'house', at.x, at.y), null);
});

test('someone standing where a building goes steps out', () => {
  const S = createState(content, 1847);
  const a = S.agents[0], at = { x: Math.floor(a.x) - 1, y: Math.floor(a.y) - 1 };
  const spot = placeProblem(S, 'farm', at.x, at.y) === null ? at : null;
  if (spot) {
    placeBuilding(S, 'farm', spot.x, spot.y, false);
    assert.equal(insideWalls(S), 0);
  }
  runFor(S, 5);
  assert.equal(insideWalls(S), 0);
});

test('nobody walks through walls in a planned two-settlement game', () => {
  const S = createState(content, 42, { planner: true, settlements: 2 });
  let worst = 0;
  runFor(S, 900, s => { worst = Math.max(worst, insideWalls(s)); });
  assert.equal(worst, 0);
});
