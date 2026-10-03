import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../src/content/node.ts';
import { createState, runFor } from '../src/sim/index.ts';
import { ageOf } from '../src/sim/knowledge.ts';

const content = loadContent();

test('eras load in order, each naming discoveries that must be thought of', () => {
  assert.ok(content.eras.length >= 2);
  assert.equal(content.eras[0].discoveries.length, 0);
  for (let i = 1; i < content.eras.length; i++) assert.ok(content.eras[i].order > content.eras[i - 1].order);
});

test('a settlement enters an age by knowing its share of the discoveries, and the next only after it', () => {
  const S = createState(content, 1847, {});
  const t = S.towns[0], learn = (id: string) => { t.knows[id] = { by: 'x', at: 0, verified: [], from: null, learned: S.t, used: S.t }; };
  assert.equal(ageOf(S, t), 0);
  for (const id of content.eras[2].discoveries) learn(id);
  assert.equal(ageOf(S, t), 0, 'letters without wheel and keel is still the first age');
  for (const id of content.eras[1].discoveries) learn(id);
  assert.equal(ageOf(S, t), 2);
  runFor(S, 2);
  assert.equal(t.age, 2);
  assert.ok(S.chronicle.some(c => c.kind === 'age'));
});
