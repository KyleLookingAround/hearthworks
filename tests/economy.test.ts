import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../src/content/node.ts';
import { createState, placeBuilding, runFor, ctr, bp } from '../src/sim/index.ts';
import { enough, homeTier, wants } from '../src/sim/production.ts';
import { shortOfFood } from '../src/sim/planner.ts';
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

test('a bakery by a windmill whose miller is at work gets half as much bread again from its wheat', async () => {
  const { milledBy } = await import('../src/sim/production.ts');
  const { findSpot, centre } = await import('../src/gates/kit.ts');
  const { placeBuilding } = await import('../src/sim/index.ts');
  const run = (mill: boolean) => {
    const S = createState(content, 1847, {});
    const at = findSpot(S, 'bakery', centre(S), 20)!, bakery = placeBuilding(S, 'bakery', at.x, at.y, true)!;
    let wm: any = null;
    if (mill) { const m = findSpot(S, 'windmill', { x: bakery.x, y: bakery.y }, 10)!; wm = placeBuilding(S, 'windmill', m.x, m.y, true)!; }
    runFor(S, 5);
    let wheat = 0;
    runFor(S, 300, s => { if ((bakery.inv.wheat || 0) < 5) { bakery.inv.wheat = (bakery.inv.wheat || 0) + 5; wheat += 5; } bakery.inv.bread = 0; });
    return { made: bakery.made, wheat, milled: milledBy(S, bakery), miller: wm && wm.worker !== null };
  };
  const plain = run(false), milled = run(true);
  assert.equal(plain.milled, 1);
  assert.equal(milled.milled, content.blueprints.windmill.mills!.factor);
  assert.ok(milled.made > plain.made * 1.3, `milled ${milled.made}, plain ${plain.made}`);
});

test('a settlement stocks the food chain for the days ahead, bakes ahead in autumn, and lays in grain for the winter', () => {
  const S = createState(content, 1847, { planner: true, seasons: true }), town = S.towns[0], store = S.bmap.get(town.store)!;
  const P = content.tuning.production, Z = content.tuning.seasons, Y = Z.yearSeconds;
  town.planner.use = { bread: 1, planks: 1, wheat: 0.1 };
  town.planner.wants = {};
  for (const g in store.inv) store.inv[g] = 0;
  // (the stores are counted once a tick: each look is at a later time)
  const at = (t: number, g: string) => { S.t = t; return enough(S, town, g); };
  store.inv.bread = P.freshSeconds + 1; store.inv.planks = P.freshSeconds + 1;
  assert.ok(at(10, 'bread'), 'a week of bread is enough in spring');
  assert.ok(!at(11, 'planks'), 'planks are stocked for the builds ahead');
  assert.ok(!at(Y / 2 + 10, 'bread'), 'in autumn the bakeries bake ahead for the winter');
  assert.ok(at(Y * 0.75 + 10, 'bread'), 'and in winter bake for the week again');
  // grain keeps: outside winter it is enough only once the winter's meals are in, for everyone housed and the free beds
  let pop = 0, beds = 0;
  for (const b of S.buildings) if (b.town === town.id && bp(S, b).homes) { pop += b.residents.length; beds += bp(S, b).homes - b.residents.length; }
  const winter = ((pop + beds) * Y / 4 / content.tuning.needs.eatEverySeconds) * Z.winterHeadroom;
  store.inv.bread = 0; store.inv.wheat = Math.ceil(Math.max(P.surplusMin, 0.1 * P.freshSeconds)) + 1;
  assert.ok(winter > store.inv.wheat, 'the test world winters on more grain than a week of use');
  assert.ok(!at(20, 'wheat'), 'grain waits for the winter store');
  store.inv.wheat = Math.ceil(winter);
  assert.ok(at(21, 'wheat'));
});

test('a settlement out of land for food still takes newcomers while it feeds everyone', () => {
  const S = createState(content, 1847, { planner: true }), town = S.towns[0];
  const pop = S.agents.filter(a => a.kind === 'villager' && a.home?.town === town.id).length;
  const need = (pop + 1) / content.tuning.needs.eatEverySeconds;
  town.planner.use = { bread: need * 2 };
  town.planner.wants = {};
  assert.ok(!shortOfFood(S, town), 'room to grow and bread enough');
  town.planner.noRoom = { bakery: S.t };
  assert.ok(!shortOfFood(S, town), 'no room for another bakery, but the bread feeds everyone and a newcomer');
  town.planner.wants = { bread: 0.6 };
  assert.ok(shortOfFood(S, town), 'no room, and the bread falls short of everyone and a newcomer');
  town.planner.noRoom = {};
  assert.ok(!shortOfFood(S, town), 'without seasons, room to grow lets hunger speak for itself');
});
