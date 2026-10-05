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

test('readers: a settlement with a library and someone schooled to read takes in what other libraries hold, without a visitor', () => {
  const read = (reader: boolean) => {
    const S = createState(content, 1847, { people: true, settlements: 2 });
    const [a, b] = S.towns;
    b.knows.depot = { by: b.name, at: 0, verified: [], from: null, learned: 0, used: 0 };
    const near = (t: typeof a, type: string) => { const y = S.bmap.get(t.store)!, at = findSpot(S, type, { x: y.x, y: y.y }, 30)!; const L = placeBuilding(S, type, at.x, at.y, true)!; L.town = t.id; return L; };
    near(a, 'library'); near(b, 'library');
    if (reader) villagers(S).find(v => v.home?.town === a.id)!.schooled = true;
    runFor(S, content.tuning.knowledge.copyEverySeconds + 2, s => { s.towns[0].visitT = 0; s.towns[1].visitT = 0; });
    return { learned: 'depot' in a.knows, read: S.chronicle.some(c => c.town === a.id && /^Readers in .* learned the Courier Depot from the shelves of /.test(c.text)) };
  };
  assert.deepEqual(read(true), { learned: true, read: true });
  assert.equal(read(false).read, false, 'nobody to read it');
});

test('a worker schooled to read learns a trade from the library as from a master', () => {
  const learn = (library: boolean) => {
    const S = createState(content, 1847, { people: true });
    if (library) stand(S, 'library');
    const farm = stand(S, 'farm');
    runFor(S, 2);
    const w = villagers(S).find(v => v.work === farm) ?? villagers(S).find(v => v.role === 'worker' && v.work)!;
    for (const v of villagers(S)) v.skill = {};
    w.schooled = true;
    runFor(S, 30, () => { for (const v of villagers(S)) if (v !== w) v.skill = {}; });
    return w.skill[w.work!.type] || 0;
  };
  const shelved = learn(true), bare = learn(false);
  // (the apprentice's factor of 3 compounds less as the skill nears 1)
  assert.ok(shelved > bare * 2, `with a library ${shelved}, without ${bare}`);
});
