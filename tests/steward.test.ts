import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../src/content/node.ts';
import { advise, chronicleLog, createState, loadGame, runFor, saveGame, ZONES } from '../src/sim/index.ts';

const content = loadContent();

test('no-build land stays empty, and a zone keeps its kind of building', () => {
  const S = createState(content, 42, { planner: true }), w = S.world, st = S.bmap.get(S.towns[0].store)!;
  const nb = 1 + ZONES.indexOf('nobuild');
  // everything within 10 tiles of the store, outside the founding layout, is no-build
  for (let y = st.y - 10; y <= st.y + 12; y++) for (let x = st.x - 12; x <= st.x + 14; x++) if (w.bgrid[y * w.w + x] === -1 && !w.road[y * w.w + x]) w.zone[y * w.w + x] = nb;
  runFor(S, 600);
  for (const b of S.buildings) for (let j = b.y; j < b.y + b.h; j++) for (let k = b.x; k < b.x + b.w; k++) assert.notEqual(w.zone[j * w.w + k], nb, `${b.type} on no-build land`);
  assert.ok(S.buildings.length > 3, 'it built elsewhere');
});

test('pace speeds the planner up', () => {
  const run = (pace: number) => { const S = createState(content, 7, { planner: true }); S.towns[0].levers.pace = pace; runFor(S, 300); return S.towns[0].planner.placed; };
  assert.ok(run(2) > run(1), 'brisk plans more in the same time');
});

test('the chronicle exports as an OKF log, newest first, and survives a save', () => {
  const S = createState(content, 99, { planner: true, settlements: 2 });
  runFor(S, 900);
  const log = chronicleLog(S, 0);
  assert.match(log, /^# Chronicle of Hearth\n/);
  assert.match(log, /\* \*\*Creation\*\*: Hearth was founded with 5 villagers/);
  const minutes = [...log.matchAll(/^## Minute (\d+)$/gm)].map(m => Number(m[1]));
  assert.deepEqual(minutes, [...minutes].sort((a, b) => b - a), 'newest first');
  const L = loadGame(content, JSON.stringify(saveGame(S)));
  assert.deepEqual(L.chronicle, S.chronicle);
  assert.deepEqual(L.towns[0].levers, S.towns[0].levers);
});

test('the advisor points at a lever when a settlement is stuck', () => {
  const S = createState(content, 1847, { planner: true });
  S.towns[0].fed = 0.5;
  assert.match(advise(S, S.towns[0])[0], /raise the priority of bread/);
  S.towns[0].fed = 1;
  S.towns[0].planner.status = 'Nothing the village knows would help: carriers are run off their feet';
  assert.ok(advise(S, S.towns[0]).some(t => /encourage them to think of the Courier Depot/.test(t)));
});
