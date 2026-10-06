import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../src/content/node.ts';
import { advise, createState, placeBuilding, reads, runFor, scholarly, villagers } from '../src/sim/index.ts';
import { findSpot, centre } from '../src/gates/kit.ts';
import { pressure, readsAt } from '../src/sim/knowledge.ts';

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

/** A building standing near the yard, with its worker at work. */
const atWork = (S: ReturnType<typeof createState>, type: string) => {
  const b = stand(S, type);
  for (let k = 0; k < 60 && S.amap.get(b.worker ?? -1)?.state !== 'working'; k++) runFor(S, 1);
  assert.equal(S.amap.get(b.worker ?? -1)?.state, 'working', `the ${type}'s worker is in`);
  return b;
};

test('the seed garden is thought of only while a university has a scholar at work, and says so', () => {
  const think = (university: boolean) => {
    const S = createState(content, 1847, { planner: true, people: true });
    const t = S.towns[0];
    if (university) atWork(S, 'university');
    // short of bread all along (scripted); without a university it never comes to know one either
    runFor(S, 900, s => { s.towns[0].planner.wants.bread = 1; if (!university) delete t.knows.university; });
    return { S, t };
  };
  const without = think(false);
  assert.ok(!('seed_garden' in without.t.knows), 'a village of hands alone never thinks of it');
  assert.ok(!without.S.chronicle.some(c => c.kind === 'scholars'));
  const { S, t } = think(true);
  assert.ok(S.chronicle.some(c => c.kind === 'invented' && c.text.includes('the Seed Garden')), 'its scholars did');
  assert.ok(S.chronicle.some(c => c.kind === 'invented' && /^The scholars of .* came up with the Seed Garden, an idea only a university finds/.test(c.text)));
  // the chronicle marks the day scholars took up their inquiries, once, naming the ideas only they find
  const opened = S.chronicle.filter(c => c.kind === 'scholars');
  assert.equal(opened.length, 1);
  assert.match(opened[0].text, /only they may think of the Seed Garden, the Printing House and the Bathhouse/);
});

test('a seed garden at work makes the farms around it bear a quarter more', () => {
  const grow = (garden: boolean) => {
    const S = createState(content, 1847, { newcomers: false });
    const farm = stand(S, 'farm');
    if (garden) atWork(S, 'seed_garden');
    const before = farm.made;
    runFor(S, 300, () => { farm.inv.wheat = 0; });
    return farm.made - before;
  };
  const bred = grow(true), saved = grow(false);
  assert.ok(bred >= saved * 1.15, `with a seed garden ${bred}, without ${saved}`);
});

test('a printing house at work makes a reader of every grown villager', () => {
  const S = createState(content, 1847, { people: true });
  const t = S.towns[0];
  assert.equal(pressure(S, t, 'reading'), 0, 'no library, nothing to read');
  stand(S, 'library');
  runFor(S, 2);
  assert.equal(pressure(S, t, 'reading'), 1, 'nobody here can read');
  assert.equal(readsAt(S, t), false);
  atWork(S, 'printing_house');
  assert.equal(pressure(S, t, 'reading'), 0);
  assert.ok(villagers(S).filter(a => a.role !== 'child').every(a => reads(S, a)));
  assert.equal(readsAt(S, t), true);
});

test('what waits on a university: each idea only scholars find, and what it waits on', () => {
  const S = createState(content, 1847, { planner: true, people: true });
  const t = S.towns[0];
  const waits = () => Object.fromEntries(scholarly(S, t).map(x => [x.B.id, x.waits]));
  assert.deepEqual(waits(), { seed_garden: 'university', bathhouse: 'university', printing_house: 'university' });
  atWork(S, 'university');
  const w = waits();
  assert.equal(w.printing_house, 'after', 'the library first');
  assert.equal(w.bathhouse, 'after', 'the healer first');
  assert.ok(w.seed_garden === 'need' || w.seed_garden === 'ready');
  assert.deepEqual(scholarly(S, t).find(x => x.B.id === 'printing_house')!.missing, ['library']);
});

test('ideas only scholars find do not count towards inquiry: a village cannot think of them', () => {
  const S = createState(content, 1847, { planner: true, people: true });
  const t = S.towns[0];
  t.planner.wants.bread = 1;
  // bread answers only the Windmill (a later age) and the Seed Garden (scholars'): no inquiry from it
  assert.equal(pressure(S, t, 'inquiry'), 0);
});

test('the advisor names an idea only scholars find, and what the settlement lacks to find it', () => {
  const S = createState(content, 1847, { planner: true, people: true });
  const t = S.towns[0];
  t.planner.wants.bread = 1;
  const said = () => advise(S, t, 9);
  assert.ok(said().some(x => /^Scholars would think of the Seed Garden for .*: encourage the University\.$/.test(x)), said().join(' / '));
  t.knows.university = { by: t.name, at: 0, verified: [], from: null, learned: 0, used: 0 };
  assert.ok(said().some(x => /Seed Garden.*build a University/.test(x)), said().join(' / '));
});
