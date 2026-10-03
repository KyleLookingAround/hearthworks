import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../src/content/node.ts';
import { createState, placeBuilding, runFor, villagers } from '../src/sim/index.ts';
import { findSpot, centre } from '../src/gates/kit.ts';
import { pressure } from '../src/sim/knowledge.ts';

const content = loadContent();
const stand = (S: ReturnType<typeof createState>, type: string) => { const at = findSpot(S, type, centre(S), 30)!; return placeBuilding(S, type, at.x, at.y, true)!; };

test('libraries and universities must be thought of; schools are known from the start', () => {
  const S = createState(content, 1847, {});
  assert.ok(!('library' in S.towns[0].knows));
  assert.ok(!('university' in S.towns[0].knows));
  assert.ok('school' in S.towns[0].knows);
});

test('forgetting is a need only with people on, and only while the loss is fresh', () => {
  const S = createState(content, 1847, { people: true });
  const t = S.towns[0];
  assert.equal(pressure(S, t, 'forgetting'), 0);
  S.chronicle.push({ t: S.t, town: t.id, kind: 'forgotten', text: 'x' });
  assert.equal(pressure(S, t, 'forgetting'), 1);
  S.t += content.tuning.knowledge.forgettingMemorySeconds + 1;
  assert.equal(pressure(S, t, 'forgetting'), 0);
  const off = createState(content, 1847, {});
  off.chronicle.push({ t: 0, town: 0, kind: 'forgotten', text: 'x' });
  assert.equal(pressure(off, off.towns[0], 'forgetting'), 0);
});

test('a library keeps what would be forgotten, and its scribe copies records for the neighbours', () => {
  const S = createState(content, 1847, { planner: true, settlements: 2 });
  const [a, b] = S.towns;
  a.knows.depot = { by: a.name, at: 0, verified: [], from: null, learned: 0, used: 0 };
  const at = findSpot(S, 'library', { x: S.bmap.get(a.store)!.x, y: S.bmap.get(a.store)!.y }, 30)!;
  placeBuilding(S, 'library', at.x, at.y, true)!.town = a.id;
  runFor(S, content.tuning.knowledge.forgetAfterSeconds + 120);
  assert.ok('depot' in a.knows, 'kept on the shelves');
  assert.ok('depot' in b.knows, 'copied to the neighbour');
});

test('children of a settlement with a school at work grow up schooled', () => {
  const S = createState(content, 1847, { planner: true, people: true });
  stand(S, 'school');
  runFor(S, 60);
  const kid = villagers(S)[0];
  kid.role = 'child'; kid.born = S.t - content.tuning.people.adultSeconds + 2;
  runFor(S, 5);
  assert.equal(kid.schooled, true);
});
