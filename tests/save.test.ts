import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadContent } from '../src/content/node.ts';
import { createState, demolish, loadGame, migrate, runFor, saveGame, SAVE_VERSION, type SaveFile } from '../src/sim/index.ts';
import { standardMetrics } from '../src/gates/kit.ts';

const content = loadContent();
const text = (S: Parameters<typeof saveGame>[0]) => JSON.stringify(saveGame(S));

test('a saved and loaded game plays on exactly as if it had never stopped', () => {
  const A = createState(content, 7, { planner: true, settlements: 2, map: 'islands', size: 'standard' });
  runFor(A, 300);
  const B = loadGame(content, text(A));
  assert.equal(text(B), text(A), 'saving the loaded game gives the same file');
  runFor(A, 300); runFor(B, 300);
  assert.deepEqual(standardMetrics(B), standardMetrics(A));
  assert.equal(text(B), text(A));
  assert.equal(B.planner, B.towns[0].planner, 'the player\'s planner is still town 0\'s');
});

test('a carrier whose job points at a demolished building survives a save', () => {
  const S = createState(content, 1847, { planner: true });
  runFor(S, 200);
  const a = S.agents.find(x => x.task)!;
  assert.ok(a, 'someone is carrying');
  const dst = a.task!.dst;
  demolish(S, dst);
  const L = loadGame(content, text(S));
  const b = L.amap.get(a.id)!;
  assert.equal(b.task?.dst.dead, true, 'the job still points at the demolished building');
  assert.ok(!L.bmap.has(dst.id));
  runFor(S, 30); runFor(L, 30);
  assert.equal(text(L), text(S));
});

test('saves carry a version: newer ones are refused, other files are not saves', () => {
  const S = createState(content, 1847);
  const f = saveGame(S);
  assert.equal(f.version, SAVE_VERSION);
  assert.equal(f.content, content.hash);
  assert.throws(() => migrate({ ...f, version: SAVE_VERSION + 1 }), /newer version/);
  assert.throws(() => loadGame(content, '{"hello":1}'), /not a Hearthworks save/);
});

test('the version 1 fixture still loads and plays', () => {
  const file = JSON.parse(readFileSync(new URL('./fixtures/save-v1.json', import.meta.url), 'utf8')) as SaveFile;
  assert.equal(file.version, 1);
  const S = loadGame(content, file);
  const before = S.t;
  runFor(S, 60);
  assert.ok(S.t > before);
  assert.ok(S.towns.length >= 1 && S.agents.length > 0);
});

test('a version 1 save is upgraded: planners gain their memory of where there was no room', () => {
  const file = JSON.parse(readFileSync(new URL('./fixtures/save-v1.json', import.meta.url), 'utf8')) as SaveFile;
  const up = migrate(file);
  assert.equal(up.version, SAVE_VERSION);
  for (const t of (up.state.towns as { planner: { noRoom: unknown } }[])) assert.deepEqual(t.planner.noRoom, {});
});

test('an older save is upgraded to version 8: seasons off, homes without a fire, nobody stalled', () => {
  const file = JSON.parse(readFileSync(new URL('./fixtures/save-v1.json', import.meta.url), 'utf8')) as SaveFile;
  const up = migrate(file);
  assert.equal((up.state as { seasons: boolean }).seasons, false);
  for (const b of up.state.buildings as { fire: number; stall: number }[]) { assert.equal(b.fire, 0); assert.equal(b.stall, 0); }
});

test('an older save is upgraded to version 9: trade off, empty ledgers, planners with no wants yet', () => {
  const file = JSON.parse(readFileSync(new URL('./fixtures/save-v1.json', import.meta.url), 'utf8')) as SaveFile;
  const up = migrate(file);
  assert.equal((up.state as { trade: boolean }).trade, false);
  for (const t of up.state.towns as { trade: { exported: object }; planner: { wants: object; use: object } }[]) {
    assert.deepEqual(t.trade.exported, {}); assert.deepEqual(t.planner.wants, {}); assert.deepEqual(t.planner.use, {});
  }
});

test('a trading game saves and loads with its ledgers', () => {
  const S = createState(content, 1847, { planner: true, settlements: 2, trade: true });
  runFor(S, 120);
  S.towns[0].trade.exported.stone = 4;
  const back = loadGame(content, saveGame(S));
  assert.equal(back.trade, true);
  assert.equal(back.towns[0].trade.exported.stone, 4);
});

test('an older save is upgraded to version 10: people off, nobody waiting for a farewell', () => {
  const file = JSON.parse(readFileSync(new URL('./fixtures/save-v1.json', import.meta.url), 'utf8')) as SaveFile;
  const up = migrate(file);
  assert.equal((up.state as { people: boolean }).people, false);
  for (const t of up.state.towns as { custom: string; rites: number[] }[]) { assert.equal(t.custom, 'burial'); assert.deepEqual(t.rites, []); }
  for (const a of up.state.agents as { skill: object }[]) assert.deepEqual(a.skill, {});
});

test('a game with people saves and loads with ages, skills and customs', () => {
  const S = createState(content, 1847, { planner: true, people: true });
  runFor(S, 300);
  const a = S.agents.find(x => x.kind === 'villager')!;
  a.skill.farm = 0.5;
  S.towns[0].rites.push(12);
  const back = loadGame(content, saveGame(S));
  const b = back.amap.get(a.id)!;
  assert.equal(b.born, a.born); assert.equal(b.dies, a.dies); assert.equal(b.skill.farm, 0.5);
  assert.deepEqual(back.towns[0].rites, [12]);
  assert.equal(back.towns[0].custom, S.towns[0].custom);
  assert.equal(back.prng.s, S.prng.s);
});

test('a version 15 save is upgraded to version 16: hardship off, no camps, laws as usual, and it plays on', () => {
  const file = JSON.parse(readFileSync(new URL('./fixtures/save-v15.json', import.meta.url), 'utf8')) as SaveFile;
  assert.equal(file.version, 15);
  const S = loadGame(content, file);
  assert.equal(S.hardship, false);
  assert.deepEqual(S.camps, []);
  assert.deepEqual(S.towns[0].laws, { rationing: false, hours: 'normal', leave: true });
  assert.ok(S.buildings.every(b => b.burn === 0 && b.flood === 0 && b.sick === 0));
  assert.equal(S.stats.fires, 0);
  runFor(S, 60);
  assert.equal(S.stats.fires + S.stats.raids, 0);
  assert.equal(text(loadGame(content, text(S))), text(S));
});

test('a version 16 save is upgraded to version 17: its road cost becomes the path cost, planned roads off, and it plays on', () => {
  const file = JSON.parse(readFileSync(new URL('./fixtures/save-v16.json', import.meta.url), 'utf8')) as SaveFile;
  assert.equal(file.version, 16);
  const old = (file.state.world as { roadCost: number }).roadCost;
  const S = loadGame(content, file);
  assert.equal(S.world.pathCost, old, 'what was walked as road is walked as path');
  assert.equal(S.world.roadCost, 1 / content.tuning.logistics.roadSpeed);
  assert.equal(S.world.roads, 0);
  assert.equal(S.plannedRoads, false);
  assert.deepEqual(S.towns[0].roads, []);
  assert.ok(S.agents.every(a => !a.task || (a.task.steps === 0 && a.task.road === 0 && a.task.path === 0)));
  runFor(S, 60);
  assert.equal(S.stats.roadsLaid, 0);
  assert.equal(text(loadGame(content, text(S))), text(S));
});

test('a version 17 save is upgraded to version 18: no settlement is yet waiting on a trade, and it plays on', () => {
  const file = JSON.parse(readFileSync(new URL('./fixtures/save-v17.json', import.meta.url), 'utf8')) as SaveFile;
  assert.equal(file.version, 17);
  const S = loadGame(content, file);
  assert.equal(S.towns.length, 2);
  assert.ok(S.towns.every(t => Object.keys(t.trade.waits).length === 0));
  runFor(S, 60);
  assert.equal(text(loadGame(content, text(S))), text(S));
});

test('a version 18 save is upgraded to version 19: carriers on a job have no further drops, and it plays on', () => {
  const file = JSON.parse(readFileSync(new URL('./fixtures/save-v18.json', import.meta.url), 'utf8')) as SaveFile;
  assert.equal(file.version, 18);
  const S = loadGame(content, file);
  const busy = S.agents.filter(a => a.task);
  assert.ok(busy.length > 0);
  assert.ok(busy.every(a => a.task!.round.length === 0));
  runFor(S, 60);
  assert.equal(text(loadGame(content, text(S))), text(S));
});

test('a version 19 save is upgraded to version 20: every building faces south, and it plays on', () => {
  const file = JSON.parse(readFileSync(new URL('./fixtures/save-v19.json', import.meta.url), 'utf8')) as SaveFile;
  assert.equal(file.version, 19);
  const S = loadGame(content, file);
  assert.ok(S.buildings.length > 0 && S.buildings.every(b => b.rot === 0));
  runFor(S, 60);
  assert.equal(text(loadGame(content, text(S))), text(S));
});

test('a version 20 save is upgraded to version 21: farms that grow are off, every building has its one place and no meals remembered', () => {
  const file = JSON.parse(readFileSync(new URL('./fixtures/save-v20.json', import.meta.url), 'utf8')) as SaveFile;
  assert.equal(file.version, 20);
  const S = loadGame(content, file);
  assert.equal(S.farms, false);
  assert.ok(S.buildings.length > 0 && S.buildings.every(b => b.size === 0 && b.hands.length === 0 && b.of === null && b.made === 0));
  assert.deepEqual(S.stats.eaten, {});
  runFor(S, 60);
  assert.ok(Object.keys(S.stats.eaten).length > 0, 'homes eat on');
  assert.equal(text(loadGame(content, text(S))), text(S));
});

test('a version 21 save is upgraded to version 22: no ox trips yet, and it plays on', () => {
  const file = JSON.parse(readFileSync(new URL('./fixtures/save-v21.json', import.meta.url), 'utf8')) as SaveFile;
  assert.equal(file.version, 21);
  const S = loadGame(content, file);
  assert.equal(S.stats.oxTrips, 0);
  assert.equal(S.stats.longGoodsByOx, 0);
  assert.equal(S.stats.longOxSeconds, 0);
  runFor(S, 60);
  assert.equal(text(loadGame(content, text(S))), text(S));
});

test('a version 22 save is upgraded to version 23: with people and seasons, each settlement keeps a harvest festival, and it plays on', () => {
  const file = JSON.parse(readFileSync(new URL('./fixtures/save-v22.json', import.meta.url), 'utf8')) as SaveFile;
  assert.equal(file.version, 22);
  const S = loadGame(content, file);
  assert.ok(S.people && S.seasons);
  assert.ok(S.towns.length > 0 && S.towns.every(t => t.feasts.length === 1 && t.feasts[0] === 'harvest' && t.feastUntil < 0));
  assert.equal(S.stats.feasts, 0);
  assert.equal(S.stats.feastsMissed, 0);
  runFor(S, 60);
  assert.equal(text(loadGame(content, text(S))), text(S));
});

test('a version 23 save is upgraded to version 24: no road of stone yet, stone walked at the tuning\'s pace, and it plays on', () => {
  const file = JSON.parse(readFileSync(new URL('./fixtures/save-v23.json', import.meta.url), 'utf8')) as SaveFile;
  assert.equal(file.version, 23);
  const S = loadGame(content, file);
  assert.equal(S.world.stone, 0);
  assert.equal(S.world.stoneCost, 1 / content.tuning.logistics.stoneRoadSpeed);
  assert.ok(!S.world.road.some(v => v === 3));
  runFor(S, 60);
  assert.equal(text(loadGame(content, text(S))), text(S));
});

test('a version 24 save is upgraded to version 25: each settlement takes a naming custom from its land and its people their names, and it plays on', () => {
  const file = JSON.parse(readFileSync(new URL('./fixtures/save-v24.json', import.meta.url), 'utf8')) as SaveFile;
  assert.equal(file.version, 24);
  const S = loadGame(content, file);
  assert.ok(S.people);
  const people = S.agents.filter(a => a.kind === 'villager');
  assert.ok(people.length > 0 && people.every(a => a.name && content.tuning.people.names[S.towns[a.home!.town].naming].includes(a.name)));
  runFor(S, 60);
  assert.equal(text(loadGame(content, text(S))), text(S));
});

test('a version 25 save is upgraded to version 26: its camps have had no gifts yet, and it plays on', () => {
  const file = JSON.parse(readFileSync(new URL('./fixtures/save-v25.json', import.meta.url), 'utf8')) as SaveFile;
  assert.equal(file.version, 25);
  const S = loadGame(content, file);
  assert.ok(S.hardship && S.trade && S.camps.length > 0);
  assert.ok(S.camps.every(c => c.friend === null && c.goodwill === 0 && c.giftT === 0));
  assert.equal(S.stats.gifts, 0);
  assert.equal(S.stats.campsSettled, 0);
  assert.equal(S.stats.barbariansSettled, 0);
  runFor(S, 60);
  assert.equal(text(loadGame(content, text(S))), text(S));
});

test('a version 26 save is upgraded to version 27: its sea has no shallows or reefs, charts are off, and it plays on', () => {
  const file = JSON.parse(readFileSync(new URL('./fixtures/save-v26.json', import.meta.url), 'utf8')) as SaveFile;
  assert.equal(file.version, 26);
  const S = loadGame(content, file);
  assert.ok(S.world.docks > 0, 'the fixture has docks, so people row');
  assert.ok(S.world.sea.every(v => v === 0));
  assert.equal(S.charts, false);
  assert.ok(S.towns.every(t => t.charted.length === 0 && !t.explore));
  assert.equal(S.stats.voyages, 0);
  runFor(S, 60);
  assert.equal(text(loadGame(content, text(S))), text(S));
});
