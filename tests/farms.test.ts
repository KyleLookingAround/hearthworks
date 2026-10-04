import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../src/content/node.ts';
import { createState, ctr, demolish, door, fits, loadGame, placeBuilding, runFor, saveGame, turnBuilding, type Building, type State } from '../src/sim/index.ts';
import { completeSite, foodsOf } from '../src/sim/world.ts';
import { crew, foodsEaten, growFarm, growProblem, mealOf, places, sizeName, strip } from '../src/sim/farms.ts';
import { wants } from '../src/sim/production.ts';

const content = loadContent();

/** A finished farm by hand near the first storage yard, facing `rot`, with room behind it to grow twice. */
function farmWithRoom(S: State, rot = 0, type = 'farm'): Building {
  const c = ctr(S.bmap.get(S.towns[0].store)!);
  for (let r = 3; r < 30; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
    const x = Math.round(c.x) + dx, y = Math.round(c.y) + dy;
    if (!fits(S, type, x, y, 2, rot)) continue;
    const b = placeBuilding(S, type, x, y, true, rot)!;
    b.town = 0;
    if (!growProblem(S, b)) return b;
    demolish(S, b);
  }
  throw new Error('no room for a farm');
}

/** Lay and finish new fields behind a farm. */
function grow(S: State, b: Building) {
  const f = growFarm(S, b)!;
  assert.ok(f, `grows: ${growProblem(S, b)}`);
  completeSite(S, f, false);
}

test('farms that grow are off by default: nothing new is known and no farm grows', () => {
  const S = createState(content, 1847);
  assert.equal(S.farms, false);
  for (const id of ['garden', 'orchard', 'pasture', 'field']) assert.ok(!(id in S.towns[0].knows), id);
  const b = placeBuilding(S, 'farm', 2, 2, true);
  assert.equal(growProblem(S, b!), 'it does not grow');
  assert.equal(sizeName(S, b!), 'Farm');
});

test('a farm grows a row of fields across its back, its door where it was, and a place for one more hand each time', () => {
  const S = createState(content, 1847, { farms: true });
  const b = farmWithRoom(S), d0 = door(b), x = b.x, y = b.y;
  assert.equal(sizeName(S, b), 'Smallholding');
  assert.equal(places(S, b), 1);
  const s = strip(b);
  assert.deepEqual(s, { x, y: y - 1, w: 3, h: 1 });
  const f = growFarm(S, b)!;
  assert.equal(f.type, 'field');
  assert.equal(f.of, b.id);
  assert.equal(f.w * f.h, 3);
  assert.match(growProblem(S, b)!, /being laid/);
  assert.equal(turnBuilding(S, b), false, 'a farm laying fields does not turn');
  completeSite(S, f, false);
  assert.ok(f.dead && !S.bmap.has(f.id), 'the fields joined the farm');
  assert.deepEqual({ x: b.x, y: b.y, w: b.w, h: b.h }, { x, y: y - 1, w: 3, h: 3 });
  assert.deepEqual(door(b), d0);
  assert.equal(S.world.bgrid[(y - 1) * S.world.w + x], b.id);
  assert.equal(sizeName(S, b), 'Farm');
  assert.equal(places(S, b), 2);
  grow(S, b);
  assert.equal(sizeName(S, b), 'Estate');
  assert.equal(b.w * b.h, 12);
  assert.match(growProblem(S, b)!, /as big as it grows/);
  assert.equal(S.stats.grown, 2);
});

test('a turned farm grows away from the way it faces', () => {
  for (const rot of [1, 2, 3]) {
    const S = createState(content, 1847, { farms: true });
    const b = farmWithRoom(S, rot), d0 = door(b), before = { ...b };
    grow(S, b);
    assert.deepEqual(door(b), d0, `rot ${rot}: the door stays`);
    assert.equal(b.w * b.h, before.w * before.h + (rot % 2 ? before.h : before.w), `rot ${rot}: one row more`);
    // the new row is opposite the door
    const s = rot === 1 ? b.x + b.w - 1 : rot === 3 ? b.x : rot === 2 ? b.y + b.h - 1 : b.y;
    assert.notEqual(rot % 2 ? d0.x : d0.y, s, `rot ${rot}: grown at the back`);
  }
});

test('a grown farm takes more hands, and makes more with them', () => {
  const S = createState(content, 1847, { farms: true, newcomers: false });
  const b = farmWithRoom(S);
  grow(S, b); grow(S, b);
  const working = () => crew(b).filter(id => S.amap.get(id)?.state === 'working').length;
  for (let k = 0; k < 60 && working() < 2; k++) runFor(S, 1);
  assert.ok(working() >= 2, `hands at work: ${working()} of ${places(S, b)}`);
  b.inv = {};
  const made = b.made;
  runFor(S, 4.5);
  assert.match(b.status.t, /of 3 hands/);
  // a smallholding makes one wheat in four seconds: two or more in four needs more than one hand
  assert.ok(b.made - made >= 2, `made ${b.made - made}`);
});

test('demolishing a farm takes its new fields with it, and a grown farm no longer turns', () => {
  const S = createState(content, 1847, { farms: true });
  const b = farmWithRoom(S);
  const f = growFarm(S, b)!;
  demolish(S, b);
  assert.ok(f.dead && !S.bmap.has(f.id));
  const c = farmWithRoom(S);
  grow(S, c);
  assert.equal(turnBuilding(S, c), false);
});

test('homes eat a varied diet: the food they have gone longest without, and keep a little of each their settlement grows', () => {
  const S = createState(content, 1847, { farms: true });
  const home = S.buildings.find(b => b.type === 'house' && b.residents.length)!;
  assert.deepEqual(foodsOf(S, home).slice(0, 5), ['bread', 'vegetables', 'fruit', 'milk', 'meat']);
  home.inv = { bread: 5, vegetables: 5 };
  assert.equal(mealOf(S, home, foodsOf(S, home)), 'bread');
  home.ate.bread = 1;
  assert.equal(mealOf(S, home, foodsOf(S, home)), 'vegetables');
  runFor(S, content.tuning.needs.eatEverySeconds * 2);
  assert.ok(home.ate.bread !== undefined && home.ate.vegetables !== undefined);
  assert.ok(foodsEaten(S, home) >= 2);
  assert.ok((S.stats.eaten.vegetables || 0) > 0);
  // a settlement that grows vegetables: its homes keep some
  assert.equal(wants(S, home, 'hamlet').vegetables, undefined);
  const g = placeBuilding(S, 'garden', 2, 2, true)!;
  g.town = home.town;
  S.t += 0.1;
  assert.equal(wants(S, home, 'hamlet').vegetables, content.tuning.farms.dietStock);
});

test('an orchard bears only once its young trees have grown', () => {
  const S = createState(content, 1847, { farms: true });
  const o = farmWithRoom(S, 0, 'orchard');
  runFor(S, 20);
  assert.match(o.status.t, /not bearing/);
  assert.equal(o.worker, null, 'nobody works young trees');
  o.plantT = content.blueprints.orchard.ripens;
  runFor(S, 30);
  assert.ok(o.made > 0 || o.worker !== null, 'it bears once grown');
});

test('a game with farms grown and growing saves and loads exactly', () => {
  const S = createState(content, 7, { planner: true, seasons: true, farms: true });
  runFor(S, 600);
  const b = farmWithRoom(S);
  growFarm(S, b);
  const text = (X: State) => JSON.stringify(saveGame(X));
  assert.equal(text(loadGame(content, text(S))), text(S));
  const L = loadGame(content, text(S));
  runFor(S, 120); runFor(L, 120);
  assert.equal(text(L), text(S));
});
