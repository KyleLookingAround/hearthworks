import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../src/content/node.ts';
import { createState, placeBuilding, runFor, ctr, bp } from '../src/sim/index.ts';
import { door } from '../src/sim/core.ts';
import { seasonOf, storesOnTrack } from '../src/sim/seasons.ts';
import { findTask } from '../src/sim/logistics.ts';
import { wants } from '../src/sim/production.ts';
import { computeMood } from '../src/sim/tick.ts';
import { findSpot } from '../src/gates/kit.ts';

const content = loadContent();
const Y = content.tuning.seasons.yearSeconds;

test('seasons are off unless asked for, and turn in quarters of the year', () => {
  assert.equal(seasonOf(createState(content, 1847, {})), null);
  const S = createState(content, 1847, { seasons: true });
  const at = (t: number) => { S.t = t; return seasonOf(S); };
  assert.deepEqual([at(0), at(Y / 4), at(Y / 2), at(Y * 0.75), at(Y)], ['spring', 'summer', 'autumn', 'winter', 'spring']);
});

test('fields rest in winter and their worker goes carrying', () => {
  const S = createState(content, 1847, { seasons: true });
  const store = S.bmap.get(S.towns[0].store)!, at = findSpot(S, 'farm', ctr(store))!;
  const f = placeBuilding(S, 'farm', at.x, at.y, true)!;
  S.t = Y * 0.75 + 1;
  runFor(S, 30);
  const made = S.stats.made.wheat || 0;
  runFor(S, 60);
  assert.equal(S.stats.made.wheat || 0, made, 'no wheat grows in winter');
  assert.equal(f.worker, null, 'nobody works a resting field');
  assert.match(f.status.t, /Winter/);
});

test('homes keep firewood and preserved food from autumn, and a home with no fire in winter is cold', () => {
  const S = createState(content, 1847, { seasons: true });
  const home = S.buildings.find(b => bp(S, b).homes && b.residents.length)!;
  S.t = 10;
  assert.equal(wants(S, home, 'hamlet').logs, undefined, 'no firewood wanted in spring');
  S.t = Y / 2 + 10;
  assert.equal(wants(S, home, 'hamlet').logs, content.tuning.seasons.firewoodStock);
  for (const g of content.tuning.seasons.preserved) assert.ok(wants(S, home, 'hamlet')[g]! > 0);
  S.t = Y * 0.75 + 10;
  for (const b of S.buildings) if (bp(S, b).homes) { b.inv.logs = 0; b.inv.bread = 5; b.hunger = 0; }
  computeMood(S);
  const cold = S.mood;
  for (const b of S.buildings) if (bp(S, b).homes) b.inv.logs = 5;
  computeMood(S);
  assert.ok(S.mood > cold, `${S.mood} warm against ${cold} cold`);
  assert.ok(S.mood - cold <= content.tuning.seasons.coldPenalty + 1e-9);
});

test('homes eat preserved food when the bread is gone', () => {
  const S = createState(content, 1847, { seasons: true });
  const home = S.buildings.find(b => bp(S, b).homes && b.residents.length)!;
  home.inv.bread = 0; home.inv.smoked_fish = 10; home.eat = 0.99;
  runFor(S, 1);
  assert.ok(home.inv.smoked_fish < 10, 'smoked fish eaten');
  assert.equal(home.hunger, 0);
});

test('newcomers wait for the winter store to keep pace', () => {
  const S = createState(content, 1847, { seasons: true });
  const t = S.towns[0];
  for (const b of S.buildings) if (bp(S, b).storage) for (const g of ['wheat', 'bread']) b.inv[g] = 0;
  S.t = 10;
  assert.ok(storesOnTrack(S, t, 1), 'spring asks nothing yet');
  S.t = Y / 2 - 10;
  assert.ok(!storesOnTrack(S, t, 1), 'empty stores at the end of summer are behind');
  S.bmap.get(t.store)!.inv.wheat = 500;
  assert.ok(storesOnTrack(S, t, 1));
});

test('newcomers come in autumn and winter while the store covers them, and rationing stretches it', () => {
  const S = createState(content, 1847, { seasons: true });
  const t = S.towns[0], yard = S.bmap.get(t.store)!;
  for (const b of S.buildings) if (bp(S, b).storage) for (const g of ['wheat', 'bread']) b.inv[g] = 0;
  const pop = S.agents.filter(a => a.kind === 'villager').length + 1, every = content.tuning.needs.eatEverySeconds;
  // halfway through winter: what is left of it, for everyone and one more
  S.t = Y * 0.875;
  assert.equal(seasonOf(S), 'winter');
  const left = (pop * Y / 8) / every * content.tuning.seasons.winterHeadroom;
  yard.inv.wheat = Math.ceil(left);
  assert.ok(storesOnTrack(S, t, 1), 'a store that covers the rest of the winter takes a newcomer');
  yard.inv.wheat = Math.floor(left * 0.75);
  assert.ok(!storesOnTrack(S, t, 1), 'one that does not, waits');
  t.laws.rationing = true;
  assert.ok(storesOnTrack(S, t, 1), 'rationing stretches it');
  // and in autumn, as in summer, by how well it is laid in
  t.laws.rationing = false; yard.inv.wheat = 0; S.t = Y * 0.6;
  assert.equal(seasonOf(S), 'autumn');
  assert.ok(!storesOnTrack(S, t, 1));
  yard.inv.wheat = 2000;
  assert.ok(storesOnTrack(S, t, 1));
});

test('a workplace left standing full sends its worker carrying', () => {
  const S = createState(content, 1847, {});
  const store = S.bmap.get(S.towns[0].store)!, at = findSpot(S, 'farm', ctr(store))!;
  const f = placeBuilding(S, 'farm', at.x, at.y, true)!;
  runFor(S, 30);
  assert.notEqual(f.worker, null, 'staffed');
  f.inv.wheat = content.tuning.logistics.outputCap;
  f.paused = false;
  const w = f.worker;
  for (let k = 0; k < content.tuning.logistics.releaseAfterSeconds * 10 + 5 && f.worker === w; k++) { f.inv.wheat = content.tuning.logistics.outputCap; runFor(S, 0.1); }
  assert.notEqual(f.worker, w, 'the worker left a full farm');
});

test('while the winter store is behind in summer and autumn, the harvest comes in ahead of other hauling', () => {
  const pick = (t: number) => {
    const S = createState(content, 1847, { planner: true, seasons: true });
    const store = S.bmap.get(S.towns[0].store)!;
    for (const k in store.inv) store.inv[k] = 0;
    store.inv.planks = 30;
    const at = findSpot(S, 'farm', ctr(store))!;
    const farm = placeBuilding(S, 'farm', at.x, at.y, true)!;
    farm.inv.wheat = 6;
    const hs = findSpot(S, 'house', ctr(store))!;
    placeBuilding(S, 'house', hs.x, hs.y, false);
    S.t = t;
    const a = S.agents.find(v => v.kind === 'villager')!;
    const d = door(farm);
    a.x = d.x + 0.5; a.y = d.y + 0.5; a.task = null; a.role = 'carrier'; a.state = 'idle';
    assert.ok(findTask(S, a));
    return { item: a.task!.item, behind: !storesOnTrack(S, S.towns[0]) };
  };
  const spring = pick(10), autumn = pick(Y / 2 + 10);
  assert.equal(spring.item, 'planks', 'in spring a site waiting for planks comes before surplus wheat');
  assert.ok(autumn.behind);
  assert.equal(autumn.item, 'wheat', 'in autumn, with the store behind, the wheat comes in first');
});
