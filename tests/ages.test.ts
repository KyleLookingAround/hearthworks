import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../src/content/node.ts';
import { createState, demolish, placeBuilding, runFor } from '../src/sim/index.ts';
import { centre, findSpot } from '../src/gates/kit.ts';
import { ageOf } from '../src/sim/knowledge.ts';

const content = loadContent();

test('eras load in order, each naming discoveries that must be thought of', () => {
  assert.ok(content.eras.length >= 2);
  assert.equal(content.eras[0].discoveries.length, 0);
  for (let i = 1; i < content.eras.length; i++) assert.ok(content.eras[i].order > content.eras[i - 1].order);
});

test('a settlement enters an age by proving its share of the discoveries in use with its works standing, and the next only after it', () => {
  const S = createState(content, 1847, {});
  const t = S.towns[0];
  const learn = (id: string, proven: boolean) => { t.knows[id] = { by: 'x', at: 0, verified: proven ? [{ by: t.name, at: 0 }] : [{ by: 'Elsewhere', at: 0 }], from: null, learned: S.t, used: S.t }; };
  assert.equal(ageOf(S, t), 0);
  for (const id of content.eras[1].discoveries) learn(id, false);
  assert.equal(ageOf(S, t), 0, 'ideas merely held, or proven by a neighbour, do not turn an age');
  for (const id of content.eras[2].discoveries) learn(id, true);
  assert.equal(ageOf(S, t), 0, 'letters without wheel and keel is still the first age');
  for (const id of content.eras[1].discoveries) learn(id, true);
  assert.equal(ageOf(S, t), 0, 'proven, but none of its works standing');
  // works of each era standing: a cart shed for wheel and keel, a library for letters
  const stand = (type: string) => { const at = findSpot(S, type, centre(S), 30)!; return placeBuilding(S, type, at.x, at.y, true)!; };
  const shed = stand('cart_shed');
  assert.equal(ageOf(S, t), 1);
  t.age = 1;
  const library = stand('library');
  assert.equal(ageOf(S, t), 2);
  runFor(S, 2);
  assert.equal(t.age, 2);
  assert.ok(S.chronicle.some(c => c.kind === 'age'));
  // an age once reached is kept while its knowledge is, though its works come down
  demolish(S, shed); demolish(S, library);
  assert.equal(ageOf(S, t), 2);
  delete t.knows.library; delete t.knows.university;
  assert.equal(ageOf(S, t), 1, 'forgotten, it falls back');
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
