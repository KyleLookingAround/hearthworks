import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../src/content/node.ts';
import { createState, runFor, villagers, bp } from '../src/sim/index.ts';
import { ageOf, customFor, skillPace } from '../src/sim/people.ts';

const content = loadContent();
const P = content.tuning.people;

test('people are off unless asked for, and then the world runs exactly as before', () => {
  const a = createState(content, 1847, { planner: true }), b = createState(content, 1847, { planner: true });
  runFor(a, 300); runFor(b, 300);
  assert.equal(a.people, false);
  assert.deepEqual(villagers(a).map(v => [v.x, v.y]), villagers(b).map(v => [v.x, v.y]));
});

test('founders are adults; each settlement takes up a custom from its land', () => {
  const S = createState(content, 1847, { planner: true, people: true, settlements: 2 });
  for (const a of villagers(S)) { assert.ok(ageOf(S, a) >= P.adultSeconds); assert.ok(a.dies > ageOf(S, a)); }
  for (const t of S.towns) assert.equal(t.custom, customFor(S, t));
  assert.ok(S.chronicle.some(c => c.kind === 'custom'));
});

test('a fed home with two adults has children, who grow up to work', () => {
  const S = createState(content, 1847, { planner: true, people: true, newcomers: false });
  const before = villagers(S).length;
  runFor(S, 1200);
  assert.ok(S.stats.births > 0, 'children were born');
  assert.ok(villagers(S).length > before);
  const child = villagers(S).find(a => a.role === 'child');
  if (child) { child.born = S.t - P.adultSeconds - 1; runFor(S, 2); assert.notEqual(child.role, 'child'); }
});

test('practice makes an expert, and an expert works faster', () => {
  const S = createState(content, 1847, { planner: true, people: true });
  runFor(S, 900);
  const best = Math.max(0, ...villagers(S).flatMap(a => Object.values(a.skill)));
  assert.ok(best >= P.expertAt, `best skill ${best}`);
  const f = S.buildings.find(b => b.type === 'farm' && !b.site)!, w = villagers(S)[0];
  assert.ok(skillPace(S, { ...w, skill: { farm: 1 } }, f) > skillPace(S, { ...w, skill: {} }, f));
});

test('the dead are honoured by their settlement\'s custom', () => {
  const S = createState(content, 1847, { planner: true, people: true });
  runFor(S, 200);
  const old = villagers(S)[0];
  old.dies = ageOf(S, old) + 1;
  runFor(S, 2);
  assert.equal(S.stats.deaths, 1);
  assert.equal(S.towns[0].rites.length, 1, 'waiting for a farewell');
  runFor(S, 400);
  assert.equal(S.stats.honoured, 1);
  assert.ok(S.buildings.some(b => bp(S, b).rite === S.towns[0].custom), 'the custom has its place');
});
