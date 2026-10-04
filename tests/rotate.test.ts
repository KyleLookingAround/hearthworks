import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../src/content/node.ts';
import { canPlace, createState, dims, door, findPath, front, loadGame, placeBuilding, runFor, saveGame, turnBuilding } from '../src/sim/index.ts';
import { centre, findSpot } from '../src/gates/kit.ts';

const content = loadContent();

test('a building faces any of four ways: its footprint turns, and its door opens on the side it faces', () => {
  const B = content.blueprints.family_house;
  assert.deepEqual(dims(B, 0), { w: B.w, h: B.h });
  assert.deepEqual(dims(B, 1), { w: B.h, h: B.w });
  const at = (rot: number) => ({ x: 10, y: 20, ...dims(B, rot), rot });
  assert.deepEqual(front(at(0)), { x: 10 + Math.floor(B.w / 2), y: 20 + B.h }, 'south: below the bottom row');
  assert.deepEqual(front(at(1)), { x: 9, y: 20 + Math.floor(B.w / 2) }, 'west: left of the left column');
  assert.deepEqual(front(at(2)), { x: 10 + Math.floor(B.w / 2), y: 19 }, 'north: above the top row');
  assert.deepEqual(front(at(3)), { x: 10 + B.h, y: 20 + Math.floor(B.w / 2) }, 'east: right of the right column');
  for (let r = 0; r < 4; r++) { const a = at(r), d = door(a); assert.ok(d.x >= a.x && d.x < a.x + a.w && d.y >= a.y && d.y < a.y + a.h, 'the door is on the footprint'); }
});

test('a building placed facing west is walked to through its west door, and keeps that door open', () => {
  const S = createState(content, 1847, {});
  const W = S.world, spot = findSpot(S, 'family_house', { x: centre(S).x + 10, y: centre(S).y }, 20)!;
  assert.ok(canPlace(S, 'family_house', spot.x, spot.y, 1));
  const b = placeBuilding(S, 'family_house', spot.x, spot.y, true, 1)!;
  assert.equal(b.rot, 1);
  assert.equal(b.w, content.blueprints.family_house.h);
  for (let j = b.y; j < b.y + b.h; j++) for (let k = b.x; k < b.x + b.w; k++) assert.equal(W.bgrid[j * W.w + k], b.id);
  const f = front(b), d = door(b);
  assert.equal(W.front[f.y * W.w + f.x], 1, 'its door front is kept open');
  assert.equal(W.door[d.y * W.w + d.x], 1);
  const store = S.bmap.get(S.towns[0].store)!, sd = door(store);
  const p = findPath(W, sd.x, sd.y, d.x, d.y)!;
  assert.ok(p && p.length > 0);
  const [px, py] = p[p.length - 2];
  assert.deepEqual({ x: px, y: py }, f, 'the way in is through the door front');
});

test('a building turns about its centre when it fits, and its old door front is freed', () => {
  const S = createState(content, 1847, {});
  const W = S.world, spot = findSpot(S, 'family_house', { x: centre(S).x, y: centre(S).y + 10 }, 20)!;
  const b = placeBuilding(S, 'family_house', spot.x, spot.y, true)!;
  const old = front(b);
  assert.ok(turnBuilding(S, b));
  assert.equal(b.rot, 1);
  assert.equal(W.front[old.y * W.w + old.x], 0);
  const f = front(b);
  assert.equal(W.front[f.y * W.w + f.x], 1);
  for (let k = 0; k < 3; k++) assert.ok(turnBuilding(S, b));
  assert.equal(b.rot, 0);
  assert.deepEqual(front(b), old, 'four turns bring it back');
  // walled in on every side, it cannot turn
  for (let j = b.y - 2; j < b.y + b.h + 2; j++) for (let k = b.x - 2; k < b.x + b.w + 2; k++) if (W.bgrid[j * W.w + k] === -1 && !(k === old.x && j === old.y)) W.ground[j * W.w + k] = 0;
  assert.ok(!turnBuilding(S, b));
  assert.equal(b.rot, 0);
});

test('a dock may face any shore, and the planner turns it to the water', () => {
  const S = createState(content, 7, { map: 'islands', size: 'm' });
  const W = S.world;
  // a shore with water to the east only
  let found: { x: number; y: number } | null = null;
  for (let y = 2; y < W.h - 4 && !found; y++) for (let x = 2; x < W.w - 4 && !found; x++) if (canPlace(S, 'dock', x, y, 3) && ![0, 1, 2].some(r => canPlace(S, 'dock', x, y, r))) found = { x, y };
  assert.ok(found, 'some shore takes a dock facing east and no other way');
  const dock = placeBuilding(S, 'dock', found!.x, found!.y, true, 3)!;
  const f = front(dock);
  assert.equal(W.ground[f.y * W.w + f.x], 0, 'it opens onto water');
  assert.equal(W.docks, 1);
});

test('a turned building is saved and loaded facing the same way', () => {
  const S = createState(content, 1847, { planner: true });
  const spot = findSpot(S, 'sawmill', centre(S), 20)!;
  placeBuilding(S, 'sawmill', spot.x, spot.y, false, 2);
  runFor(S, 30);
  const back = loadGame(content, saveGame(S));
  const b = back.buildings.find(o => o.type === 'sawmill' && o.x === spot.x && o.y === spot.y)!;
  assert.equal(b.rot, 2);
  assert.deepEqual(front(b), front(S.buildings.find(o => o.id === b.id)!));
});
