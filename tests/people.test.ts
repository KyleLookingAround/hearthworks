import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../src/content/node.ts';
import { createState, runFor, villagers, bp } from '../src/sim/index.ts';
import { ageOf, bringFeast, customFor, FEAST, feastFor, feastMood, holdFeasts, skillPace } from '../src/sim/people.ts';
import { computeMood } from '../src/sim/index.ts';

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

test('with seasons, each settlement keeps a feast from its land, holds it when the stores allow, and is lifted by it', () => {
  const S = createState(content, 1847, { planner: true, people: true, seasons: true });
  const t = S.towns[0], store = S.bmap.get(t.store)!;
  assert.deepEqual(t.feasts, [feastFor(S, t)]);
  t.feasts = ['harvest'];
  const pop = villagers(S).length, need = Math.ceil(pop * P.harvestBread);
  // not its season: nothing happens
  holdFeasts(S, 'winter');
  assert.equal(S.stats.feasts, 0);
  // too little bread: missed, and nothing taken
  store.inv.bread = need - 1;
  holdFeasts(S, FEAST.harvest.season);
  assert.equal(S.stats.feastsMissed, 1);
  assert.equal(store.inv.bread, need - 1);
  assert.equal(feastMood(S, t), 0);
  // enough: held, the bread eaten, and the mood lifted for a while
  store.inv.bread = need + 3;
  holdFeasts(S, FEAST.harvest.season);
  assert.equal(S.stats.feasts, 1);
  assert.equal(store.inv.bread, 3);
  assert.equal(feastMood(S, t), P.feastMood);
  for (const a of villagers(S)) if (a.home) a.home.inv = {};
  computeMood(S);
  const lifted = t.mood;
  t.feastUntil = S.t;
  computeMood(S);
  assert.ok(lifted > t.mood || lifted === 1, `${lifted} against ${t.mood}`);
});

test('without seasons there are no feasts, and a visitor may bring a neighbour\'s feast home', () => {
  const off = createState(content, 1847, { planner: true, people: true });
  assert.ok(off.towns.every(t => t.feasts.length === 0));
  const S = createState(content, 1847, { planner: true, people: true, seasons: true, settlements: 2 });
  const [a, b] = S.towns;
  a.feasts = ['harvest']; b.feasts = ['midwinter'];
  for (let k = 0; k < 200 && !a.feasts.includes('midwinter'); k++) bringFeast(S, a, b);
  assert.deepEqual(a.feasts, ['harvest', 'midwinter']);
  assert.ok(S.chronicle.some(c => c.town === a.id && c.kind === 'feast' && c.text.includes('took up')));
});
