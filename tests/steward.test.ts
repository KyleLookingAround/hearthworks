import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../src/content/node.ts';
import { advise, bp, chronicleLog, createState, loadGame, placeBuilding, runFor, saveGame, ZONES } from '../src/sim/index.ts';
import { centre, findSpot } from '../src/gates/kit.ts';
import { look } from '../src/sim/planner/sense.ts';
import { enough } from '../src/sim/production.ts';

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

test('a need put first is wanted beyond its use, stocked deeper, and never ahead of one with nothing made', () => {
  const S = createState(content, 7, { planner: true });
  runFor(S, 300);
  const t = S.towns[0], P = content.tuning.planner, pick = (k: string) => look(S, t).shortages.find(s => s.key === k);
  // bread put first is wanted beyond its use and weighed up, but its shortage of its use alone is kept
  const normal = pick('bread')!;
  t.levers.priority.bread = 4;
  const first = pick('bread')!;
  assert.ok(first.sev >= normal.sev && first.sev <= Math.max(normal.sev, P.priorityCeiling), 'weighed up to the ceiling');
  assert.equal(first.bare, normal.sev, 'its shortage of its use alone is what it was');
  // a need with nothing made at all still comes before it
  for (const sh of look(S, t).shortages) if (sh.key !== 'bread') assert.ok(sh.sev < 1 || sh.sev > first.sev || first.sev < 1);
  assert.ok(first.sev < 1);
  // stocked deeper: bread enough at Normal is not enough put first
  t.levers.priority.bread = 1;
  const yard = S.bmap.get(t.store)!;
  t.planner.wants = {}; t.planner.use.bread = 2;
  for (const b of S.buildings) if (b.town === t.id && bp(S, b).storage) b.inv.bread = 0;
  yard.inv.bread = 1.5 * 2 * content.tuning.production.freshSeconds;
  // (stores are counted once a tick: a new instant counts them afresh)
  S.t += 1e-6;
  assert.ok(enough(S, t, 'bread'));
  t.levers.priority.bread = 4; S.t += 1e-6;
  assert.ok(!enough(S, t, 'bread'), 'put first, the same stock is not enough');
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
  S.towns[0].planner.status = 'No room for a Farm: wheat is running low';
  assert.ok(advise(S, S.towns[0]).includes('Hearth has no room for a Farm (wheat is running low): paint a zone where there is room, or lift no-build land.'));
});

test('the advisor points at carts for long hauls, at oxen without feed, and at a diet of bread alone', () => {
  const S = createState(content, 1847, { planner: true, carts: true, farms: true });
  const t = S.towns[0], K = content.tuning.knowledge;
  t.reach = K.distanceFrom + K.distanceSpan;
  assert.ok(advise(S, t, 9).some(x => /encourage the Cart Shed/.test(x)));
  t.knows.cart_shed = { by: t.name, at: 0, verified: [], from: null, learned: 0, used: 0 };
  t.reach = K.longHaulFrom + K.distanceSpan;
  assert.ok(advise(S, t, 9).some(x => /encourage the Ox Barn/.test(x)));
  const at = findSpot(S, 'ox_barn', centre(S), 12)!;
  const barn = placeBuilding(S, 'ox_barn', at.x, at.y, true)!;
  barn.town = t.id;
  assert.ok(advise(S, t, 9).some(x => /oxen of .* wait for wheat/.test(x)));
  barn.inv.wheat = 4;
  assert.ok(!advise(S, t, 9).some(x => /wait for wheat/.test(x)));
  // four homes or more, and nothing grown but wheat
  for (let k = 0; k < 4; k++) { const h = findSpot(S, 'house', centre(S), 14)!; placeBuilding(S, 'house', h.x, h.y, true)!.town = t.id; }
  assert.ok(advise(S, t, 9).some(x => /eats nothing but bread/.test(x)));
});
