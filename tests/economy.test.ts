import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../src/content/node.ts';
import { createState, placeBuilding, runFor, ctr } from '../src/sim/index.ts';
import { homeTier, wants } from '../src/sim/production.ts';
import { findSpot } from '../src/gates/kit.ts';

const content = loadContent();

test('the standard map holds every deposit the new workplaces need', () => {
  const S = createState(content, 1847, {}), seen = new Set<number>();
  for (const d of S.world.deposit) seen.add(d);
  for (const k of [1, 2, 3, 4, 5]) assert.ok(seen.has(k), `deposit ${k}`);
});

test('tools speed up the work that uses them, and wear out', () => {
  const run = (tools: number) => {
    const S = createState(content, 1847, {});
    const store = S.bmap.get(S.towns[0].store)!, at = findSpot(S, 'farm', ctr(store))!;
    const f = placeBuilding(S, 'farm', at.x, at.y, true)!;
    f.inv.tools = tools;
    runFor(S, 120);
    return { made: S.stats.made.wheat || 0, left: f.inv.tools || 0 };
  };
  const bare = run(0), tooled = run(5);
  assert.ok(tooled.made > bare.made, `${tooled.made} with tools, ${bare.made} without`);
});

test('food left out in a storage yard spoils; a granary keeps it', () => {
  const S = createState(content, 1847, {});
  const store = S.bmap.get(S.towns[0].store)!;
  store.inv.bread = 200;
  runFor(S, 61);
  assert.ok(store.inv.bread < 200, 'stale bread is thrown out');
  assert.ok(S.stats.spoiled > 0);
  const at = findSpot(S, 'granary', ctr(store))!, g = placeBuilding(S, 'granary', at.x, at.y, true)!;
  g.inv.bread = 200;
  runFor(S, 61);
  assert.equal(g.inv.bread, 200, 'the granary keeps it');
});

test('a home climbs the tiers by the goods on its shelf, and wants comforts by its settlement form', () => {
  const S = createState(content, 1847, {});
  const h = S.buildings.find(b => b.type === 'house')!;
  h.inv = { bread: 2 };
  assert.equal(homeTier(S, h), 1);
  h.inv.cloth = 1;
  assert.equal(homeTier(S, h), 2);
  h.inv.tools = 1;
  assert.equal(homeTier(S, h), 3);
  assert.ok(!('fish' in wants(S, h, 'hamlet')));
  assert.ok('fish' in wants(S, h, 'village') && !('tools' in wants(S, h, 'village')));
  assert.ok('tools' in wants(S, h, 'town'));
});

test('a planning town builds chains several steps deep and lifts homes to the third tier', () => {
  const S = createState(content, 7, { planner: true });
  runFor(S, 2700);
  for (const t of ['quarry', 'mine', 'smithy', 'fishery', 'weaver']) assert.ok(S.buildings.some(b => b.type === t), t);
  assert.ok(S.buildings.some(b => homeTier(S, b) === 3), 'some home is well off');
  assert.equal(S.stats.departures, 0);
});
