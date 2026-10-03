import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../src/content/node.ts';
import { bp, ctr, createState, defence, findSpot, ignite, loadGame, placeBuilding, runFor, saveGame, strike, villagers, type Content, type State } from '../src/sim/index.ts';
import { floodLand, guarded } from '../src/sim/hardship.ts';

const content = loadContent();
const H = content.tuning.hardship;
// nothing strikes of itself: each test brings down what it needs
const quiet: Content = { ...content, tuning: { ...content.tuning, hardship: { ...H, fireEverySeconds: 1e12, sicknessEverySeconds: 1e12, campEverySeconds: 1e12, floodChance: 0 } } };
const at = (S: State, type: string) => { const p = findSpot(S, type, ctr(S.bmap.get(S.towns[0].store)!), 30)!; return placeBuilding(S, type, p.x, p.y, true)!; };

test('hardship is off unless asked for, and then nothing strikes', () => {
  const S = createState(content, 1847, { planner: true, seasons: true, map: 'landmass', size: 'm' });
  runFor(S, 1500);
  assert.equal(S.hardship, false);
  const st = S.stats;
  assert.equal(st.fires + st.floods + st.outbreaks + st.raids + st.camps, 0);
  assert.equal(S.hrng.s, (1847 ^ 0x68617264) | 0, 'its stream is untouched');
});

test('fire guts a building, which is rebuilt at a share of its cost; a well puts it out', () => {
  const S = createState(quiet, 1847, { hardship: true });
  const house = S.buildings.find(b => bp(S, b).homes)!, people = house.residents.length;
  ignite(S, house, true);
  runFor(S, H.burnSeconds + 2);
  assert.equal(house.site, true, 'gutted');
  assert.equal(house.residents.length, people, 'its people stay on in the shell');
  assert.equal(house.reason, 'rebuilding after the fire');
  const B = content.blueprints[house.type];
  for (const k in B.cost) assert.equal(house.inv[k] || 0, Math.floor(B.cost[k] * (1 - H.rebuildShare)));
  assert.equal(S.stats.burnt, 1);

  const T = createState(quiet, 1847, { hardship: true });
  const h2 = T.buildings.find(b => bp(T, b).homes)!;
  const well = placeBuilding(T, 'well', h2.x, h2.y - 3, true) ?? at(T, 'well');
  assert.ok(guarded(T, h2, 'fire'), 'the well reaches the house');
  ignite(T, h2, true);
  runFor(T, H.douseSeconds + 2);
  assert.equal(h2.burn, 0); assert.equal(h2.site, false, 'put out before it gutted the house');
  assert.ok(well);
});

test('fire jumps between buildings wall to wall', () => {
  const S = createState({ ...quiet, tuning: { ...quiet.tuning, hardship: { ...quiet.tuning.hardship, spreadChance: 1 } } }, 1847, { hardship: true });
  const a = S.buildings.find(b => bp(S, b).homes)!;
  const b = placeBuilding(S, 'house', a.x + a.w, a.y, true) ?? placeBuilding(S, 'house', a.x - a.w, a.y, true);
  assert.ok(b, 'a house built against it');
  ignite(S, a, true);
  runFor(S, 2);
  assert.ok(b!.burn > 0, 'the fire spread');
  assert.equal(S.stats.fires, 1, 'one outbreak, however far it spreads');
});

test('sickness spreads home to home and kills some; a healer stops it spreading and saves lives', () => {
  const S = createState({ ...quiet, tuning: { ...quiet.tuning, hardship: { ...quiet.tuning.hardship, sickDeath: 1 } } }, 1847, { hardship: true, newcomers: false });
  const n = villagers(S).length;
  assert.ok(strike(S, S.towns[0], 'sickness'));
  runFor(S, H.sickSeconds + 2);
  assert.ok(villagers(S).length < n, 'the sick died');
  assert.equal(S.stats.sickDeaths, n - villagers(S).length);
  assert.ok('sickness' in S.towns[0].struck);

  const T = createState({ ...quiet, tuning: { ...quiet.tuning, hardship: { ...quiet.tuning.hardship, healedDeath: 0 } } }, 1847, { hardship: true, newcomers: false });
  const healer = at(T, 'healer');
  runFor(T, 20);
  assert.equal(T.amap.get(healer.worker!)?.state, 'working', 'the healer is in');
  const m = villagers(T).length;
  assert.ok(strike(T, T.towns[0], 'sickness'));
  const sick = T.buildings.find(b => b.sick > 0)!;
  assert.ok(sick.sick <= H.healedSeconds);
  runFor(T, H.healedSeconds + 2);
  assert.equal(villagers(T).length, m, 'nobody died');
});

test('the waters rise over low land by the shore, and a levee keeps them off', () => {
  const S = createState(quiet, 1847, { hardship: true, map: 'landmass', size: 'm' });
  // a building on low land by the water
  const W = S.world;
  let low: { x: number; y: number } | null = null;
  for (let i = 0; i < W.ground.length && !low; i++) {
    const x = i % W.w, y = Math.floor(i / W.w);
    if (W.ground[i] === 2 && W.height[i] <= H.floodHeight && findSpot(S, 'farm', { x, y }, 1)) { const p = findSpot(S, 'farm', { x, y }, 1)!; const b = placeBuilding(S, 'farm', p.x, p.y, true)!; if (floodLand(S, b)) low = p; }
  }
  assert.ok(low, 'found low land');
  const farm = S.buildings.find(b => b.type === 'farm' && floodLand(S, b))!;
  farm.inv = { wheat: 10 };
  assert.ok(strike(S, S.towns[farm.town] ?? S.towns[0], 'flood'));
  assert.equal(farm.flood, H.floodSeconds);
  assert.equal(farm.inv.wheat, Math.floor(10 * (1 - H.floodLoss)));
  farm.flood = 0;
  const levee = placeBuilding(S, 'levee', farm.x, farm.y - 2, true) ?? placeBuilding(S, 'levee', farm.x, farm.y + farm.h + 1, true);
  assert.ok(levee && guarded(S, farm, 'flood'));
  strike(S, S.towns[0], 'flood');
  assert.equal(farm.flood, 0, 'the levee held');
});

test('raiders loot an undefended store and are beaten off by a watched, walled one', () => {
  const S = createState(quiet, 1847, { hardship: true, map: 'landmass', size: 'm' });
  const town = S.towns[0], yard = S.bmap.get(town.store)!;
  yard.inv.planks = 100;
  assert.ok(strike(S, town, 'raids'), 'a camp pitched on the nearest wild land sends raiders');
  assert.equal(S.camps.length, 1);
  runFor(S, 120);
  assert.equal(S.stats.raids, 1); assert.equal(S.stats.repelled, 0);
  assert.ok(S.stats.looted > 0 && yard.inv.planks < 100, 'they carried goods off');

  const T = createState(quiet, 1847, { hardship: true, map: 'landmass', size: 'm' });
  const t = T.towns[0];
  at(T, 'palisade'); const tower = at(T, 'watchtower');
  runFor(T, 20);
  assert.equal(T.amap.get(tower.worker!)?.state, 'working', 'a lookout on watch');
  const D = defence(T, t);
  assert.ok(D.warned && D.total >= H.campStrength, `defence ${D.total}`);
  strike(T, t, 'raids');
  runFor(T, 120);
  assert.equal(T.stats.raids, 1); assert.equal(T.stats.repelled, 1); assert.equal(T.stats.looted, 0);
});

test('a camp the settlements grow up to breaks up', () => {
  const S = createState({ ...quiet, tuning: { ...quiet.tuning, hardship: { ...quiet.tuning.hardship, campEverySeconds: 5 } } }, 1847, { hardship: true, map: 'landmass', size: 'm' });
  runFor(S, 6);
  assert.ok(S.camps.length >= 1, 'camps are pitched on wild land');
  const c = S.camps[0];
  c.raid = null; c.raidT = 1e9;
  // a building beside the camp settles its land
  const p = findSpot(S, 'house', { x: c.x, y: c.y }, 10)!;
  placeBuilding(S, 'house', p.x, p.y, true);
  runFor(S, 6);
  assert.ok(!S.camps.includes(c), 'it broke up');
});

test('laws: rationing makes food last longer, and with leaving forbidden the hungry stay', () => {
  const eaten = (ration: boolean) => {
    const S = createState(quiet, 1847, { newcomers: false });
    S.towns[0].laws.rationing = ration;
    const homes = S.buildings.filter(b => bp(S, b).homes);
    for (const h of homes) h.inv.bread = 100;
    runFor(S, 300);
    return homes.reduce((n, h) => n + 100 - (h.inv.bread || 0), 0);
  };
  const plain = eaten(false), rationed = eaten(true);
  assert.ok(rationed < plain * 0.75, `${rationed} eaten rationed against ${plain}`);

  const S = createState(quiet, 1847, { newcomers: false });
  S.towns[0].laws.leave = false;
  for (const b of S.buildings) b.inv = {};
  runFor(S, content.tuning.needs.leaveAfterHungrySeconds * 2);
  assert.equal(S.stats.departures, 0, 'nobody left');
  runFor(S, content.tuning.needs.leaveAfterHungrySeconds * H.starveFactor);
  assert.ok(S.stats.starved > 0, 'and in time someone starved');
});

test('a game with hardship saves and loads mid-raid and plays on the same', () => {
  const S = createState(quiet, 1847, { hardship: true, planner: true, map: 'landmass', size: 'm' });
  runFor(S, 60);
  strike(S, S.towns[0], 'raids'); strike(S, S.towns[0], 'sickness'); strike(S, S.towns[0], 'fire');
  S.towns[0].laws = { rationing: true, hours: 'long', leave: false };
  runFor(S, 5);
  const L = loadGame(quiet, JSON.stringify(saveGame(S)));
  assert.deepEqual(L.camps, S.camps); assert.deepEqual(L.towns[0].laws, S.towns[0].laws);
  runFor(S, 120); runFor(L, 120);
  assert.equal(JSON.stringify(saveGame(L)), JSON.stringify(saveGame(S)));
});

test('a gutted depot loses its bots and winds up new ones when rebuilt, never twice as many', () => {
  const S = createState(quiet, 1847, { hardship: true });
  const depot = at(S, 'depot'), n = content.blueprints.depot.couriers!.count;
  assert.equal(depot.bots.length, n);
  ignite(S, depot, true);
  runFor(S, H.burnSeconds + 2);
  assert.equal(depot.site, true); assert.equal(depot.bots.length, 0);
  assert.equal(S.agents.filter(a => a.kind === 'bot').length, 0);
  for (const k in content.blueprints.depot.cost) depot.inv[k] = content.blueprints.depot.cost[k];
  runFor(S, content.tuning.production.buildSeconds + 2);
  assert.equal(depot.site, false);
  assert.equal(S.agents.filter(a => a.kind === 'bot').length, n);
});
