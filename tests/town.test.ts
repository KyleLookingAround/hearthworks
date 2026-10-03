import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../src/content/node.ts';
import { createState, runFor, villagers, door, type Content } from '../src/sim/index.ts';
import { formOf, hubs } from '../src/sim/planner.ts';
import { reachable } from '../src/sim/path.ts';

const content = loadContent();
const tuned = (edit: (c: Content) => void) => { const c = structuredClone(content); edit(c); return c; };

test('a settlement takes the form its size gives it', () => {
  const S = createState(content, 1847, { planner: true });
  assert.equal(formOf(S, S.towns[0]), 'hamlet');
  const T = createState(tuned(c => { c.tuning.planner.villageAt = 1; c.tuning.planner.townAt = 1000; }), 1847, { planner: true });
  assert.equal(formOf(T, T.towns[0]), 'village');
});

test('a town builds the top rung of the ladder and lays streets', () => {
  const S = createState(tuned(c => { c.tuning.planner.villageAt = 0; c.tuning.planner.townAt = 0; }), 7, { planner: true });
  // terraces are built of bricks: the town makes them first
  runFor(S, 1500);
  assert.ok(S.buildings.some(b => b.type === 'terrace'), 'terraces');
  assert.ok(S.towns[0].streets.length >= 1);
});

test('replanning moves everyone out first: nobody leaves when an old block comes down', () => {
  const S = createState(tuned(c => { c.tuning.planner.townAt = 30; c.tuning.planner.replanMinAge = 0; c.tuning.planner.replanEverySeconds = 30; }), 42, { planner: true });
  runFor(S, 1500);
  assert.ok(S.stats.replanned >= 1, `replanned ${S.stats.replanned}`);
  assert.equal(S.stats.demolitionDepartures, 0);
  assert.ok(S.buildings.some(b => b.type === 'house'), 'never the last cottage');
});

test('a crowded district splits off a new one, and every door stays reachable', () => {
  const S = createState(tuned(c => { c.tuning.planner.districtBuildings = 10; }), 99, { planner: true, settlements: 2 });
  runFor(S, 1200);
  assert.ok(hubs(S, S.towns[0]).length >= 2, 'a second district');
  const w = S.world, d = door(S.bmap.get(S.towns[0].store)!), r = reachable(w, d.x, d.y);
  const cut = S.buildings.filter(b => b.town === 0 && !S.content.blueprints[b.type].bridge && !r[door(b).y * w.w + door(b).x]);
  assert.deepEqual(cut.map(b => b.type), [], 'no door walled in');
  assert.ok(villagers(S).length > 40);
});
