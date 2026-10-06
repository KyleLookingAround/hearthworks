import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadContent } from '../src/content/node.ts';
import { advise, createState, loadGame, runFor, saveGame, takeAdvice, type SaveFile, type State } from '../src/sim/index.ts';
import { adviceFor, updateAdvice } from '../src/sim/steward.ts';
import { ideasNear } from '../src/sim/knowledge.ts';
import { ideasOf, nextAgeText } from '../src/ui/readouts.ts';

const content = loadContent();
const A = content.tuning.advisor;
/** Run the advisor at game time `t` (it looks on whole multiples of `every_seconds`). */
const at = (S: State, t: number) => { S.t = t; updateAdvice(S); return S.towns[0].advice.map(x => x.key); };

test('the advisor gives a tip, keeps it while it holds, then is quiet about it until its grounds change', () => {
  const S = createState(content, 1847, { planner: true });
  const t = S.towns[0];
  t.fed = 0.3;
  assert.deepEqual(at(S, 0), ['hungry']);
  assert.equal(t.advice[0].act && 'need' in t.advice[0].act && t.advice[0].act.value, 2, 'it offers bread one level up');
  assert.deepEqual(at(S, A.holdSeconds - A.everySeconds), ['hungry'], 'kept while it holds');
  assert.deepEqual(at(S, A.holdSeconds), [], 'dropped once held long enough');
  assert.deepEqual(at(S, A.quietSeconds - A.everySeconds), [], 'not given again while nothing changed');
  // the player takes the advice: its grounds change, so it may offer the next level at once
  assert.ok(takeAdvice(S, { town: 0, key: 'hungry' }).ok === false, 'nothing standing to take');
  t.levers.priority.bread = 2;
  assert.deepEqual(at(S, A.quietSeconds), ['hungry']);
  assert.ok(takeAdvice(S, { town: 0, key: 'hungry' }).ok);
  assert.equal(t.levers.priority.bread, 4);
  // with bread first already, it offers rationing instead
  assert.match(adviceFor(S, t)[0].text, /ration food/);
});

test('the advisor ranks its tips: hunger before a diet of bread alone', () => {
  const S = createState(content, 1847, { planner: true, hardship: true, seasons: true });
  const t = S.towns[0];
  t.fed = 0.5; t.laws.leave = false;
  const keys = adviceFor(S, t).map(x => x.key);
  assert.equal(keys[0], 'hungry');
  assert.ok(keys.indexOf('hungry_stay') > 0);
  assert.equal(adviceFor(S, t).find(x => x.key === 'hungry_stay')?.label, 'Let them leave');
});

test('the advisor does not advise zoning on land with no room left to zone', () => {
  const S = createState(content, 1847, { planner: true });
  const t = S.towns[0], W = S.world;
  t.planner.wishes = [{ key: 'wheat', sev: 1, type: 'farm', verdict: 'room', text: 'No room for a Farm: wheat is running low', why: 'wheat is running low' }];
  assert.ok(advise(S, t, 9).some(x => /paint a zone/.test(x)));
  // every open tile grown over: nothing a zone could open
  for (let i = 0; i < W.tree.length; i++) if (W.ground[i] === 2 && W.bgrid[i] < 0) W.tree[i] = 1;
  assert.ok(!advise(S, t, 9).some(x => /paint a zone/.test(x)));
});

test('the advisor offers to encourage only an idea the settlement could think of now', () => {
  const S = createState(content, 1847, { planner: true });
  const t = S.towns[0];
  t.planner.wishes = [{ key: 'hauling', sev: 1, type: null, verdict: 'none', text: 'Nothing the hamlet knows would help: carriers are run off their feet', why: 'carriers are run off their feet' }];
  const tip = adviceFor(S, t).find(x => x.key === 'answer:hauling')!;
  assert.deepEqual(tip.act, { lever: 'encourage', value: 'depot' });
  t.levers.encourage = 'depot';
  assert.ok(!adviceFor(S, t).some(x => x.key === 'answer:hauling'), 'already encouraged');
});

test('progress towards the next ideas: how strained, and how far of the way', () => {
  const S = createState(content, 1847, {});
  const t = S.towns[0], K = content.tuning.knowledge;
  t.haul = K.haulTarget + (1 - K.haulTarget) * K.struggleSeverity * 0.7;
  const depot = ideasNear(S, t).find(x => x.B.id === 'depot')!;
  assert.ok(Math.abs(depot.share - 0.7) < 1e-9);
  assert.ok(ideasOf(S, t).some(x => x.text === 'Courier Depot: carriers strained, 70% of the way'));
  t.haul = 1;
  assert.match(ideasOf(S, t).find(x => x.id === 'depot')!.text, /thinking on it/);
  // nothing a later age opens, nor what must be known first
  assert.ok(!ideasNear(S, t).some(x => x.B.id === 'windmill' || x.B.id === 'ox_barn'));
  assert.match(nextAgeText(S, t)!, /^The Age of Wheel and Keel: prove 1 more of the Bridge, the Dock or the Cart Shed in use, and have one standing\.$/);
});

test('a version 32 save is upgraded to version 33: its settlements have no advice yet, take some on their next look, and it plays on', () => {
  const file = JSON.parse(readFileSync(new URL('./fixtures/save-v32.json', import.meta.url), 'utf8')) as SaveFile;
  assert.equal(file.version, 32);
  const S = loadGame(content, file);
  assert.ok(S.towns.every(t => t.advice.length === 0 && Object.keys(t.advised).length === 0));
  runFor(S, 60);
  const text = (s: State) => JSON.stringify(saveGame(s));
  assert.equal(text(loadGame(content, text(S))), text(S));
});
