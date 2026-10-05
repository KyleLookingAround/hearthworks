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

test('an era unlocks blueprints of its own: only a settlement of that age thinks of the windmill', async () => {
  const { ageNeeded, pressure } = await import('../src/sim/knowledge.ts');
  const clock = content.eras.findIndex(E => E.id === 'clockwork');
  assert.deepEqual(content.eras[clock].unlocks, ['windmill', 'conveyor']);
  assert.equal(ageNeeded({ content } as any, 'windmill'), clock);
  assert.equal(ageNeeded({ content } as any, 'bridge'), 0, 'discoveries of earlier eras are not locked');
  const strained = (age: number) => {
    const S = createState(content, 1847, {});
    const t = S.towns[0];
    let known = false;
    runFor(S, 1800, s => {
      const o = s.towns[0];
      o.planner.wants.bread = 1; o.levers.encourage = 'windmill';
      // hold the settlement at the age asked (what it knows is not the point here)
      o.age = age;
      if ('windmill' in o.knows) known = true;
    });
    return { known, p: pressure(S, t, 'bread') };
  };
  const before = strained(clock - 1), at = strained(clock);
  assert.equal(before.p, 1);
  assert.equal(before.known, false, 'not thought of before the age');
  assert.equal(at.known, true, 'thought of in the Age of Clockwork');
});
