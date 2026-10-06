import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../src/content/node.ts';
import { readFileSync } from 'node:fs';
import { createState, loadGame, runFor, saveGame, villagers, bp, type SaveFile, type State } from '../src/sim/index.ts';
import { ageOf, bringFeast, craftable, customFor, FEAST, feastFor, feastMood, feastStock, giveWay, holdFeasts, isCraft, landCustom, landFeast, missFeasts, nameFor, namingFor, skillPace, takeCraft } from '../src/sim/people.ts';
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
  S.t = content.tuning.seasons.yearSeconds / 2 + 1; // autumn
  // not its season: nothing happens
  holdFeasts(S, 'winter');
  assert.equal(S.stats.feasts, 0);
  // too little bread: put off, nothing taken, and missed only if the season ends without it
  store.inv.bread = need - 1;
  holdFeasts(S, FEAST.harvest.season);
  assert.equal(S.stats.feasts, 0);
  assert.equal(S.stats.feastsMissed, 0);
  assert.ok(S.chronicle.some(c => c.town === t.id && c.text.includes('put off')));
  assert.equal(store.inv.bread, need - 1);
  assert.equal(feastMood(S, t), 0);
  // the bakeries lay in for it: what the feast needs counts toward the stock of bread until it is held
  assert.ok(feastStock(S, t, 'bread', pop) >= need);
  // later in the season, enough: held, the bread eaten, and the mood lifted for a while
  store.inv.bread = need + 3;
  holdFeasts(S, FEAST.harvest.season, false);
  assert.equal(S.stats.feasts, 1);
  assert.equal(store.inv.bread, 3);
  assert.equal(feastMood(S, t), P.feastMood);
  // held once a season: no second festival, and nothing laid in for it any more
  store.inv.bread = need + 3;
  holdFeasts(S, FEAST.harvest.season, false);
  assert.equal(S.stats.feasts, 1);
  assert.equal(feastStock(S, t, 'bread', pop), 0);
  // a season gone by without its feast: missed
  const other = S.towns[1] ?? t;
  const until = t.feastUntil;
  S.t += content.tuning.seasons.yearSeconds / 4;
  t.feastUntil = 0;
  missFeasts(S, FEAST.harvest.season);
  assert.equal(S.stats.feastsMissed, S.towns.filter(o => o.feasts.includes('harvest')).length);
  assert.ok(S.chronicle.some(c => c.town === other.id && c.text.includes('could not hold')));
  S.t -= content.tuning.seasons.yearSeconds / 4;
  t.feastUntil = until;
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

test('naming customs: each settlement names its people from its land, by seed and id alone, drawing from no random stream', () => {
  const S = createState(content, 1847, { planner: true, people: true, settlements: 2 });
  for (const t of S.towns) {
    assert.equal(t.naming, namingFor(S, t));
    // the same lines as the custom for the dead
    assert.equal(t.naming, ({ ship: 'sea', cremation: 'trees', burial: 'fields' } as const)[customFor(S, t)]);
    assert.ok(S.chronicle.some(c => c.town === t.id && c.kind === 'naming'));
  }
  for (const a of villagers(S)) assert.ok(P.names[S.towns[a.home!.town].naming].includes(a.name), `${a.name} is a name of its settlement's custom`);
  // the same seed names everyone the same way
  const again = createState(content, 1847, { planner: true, people: true, settlements: 2 });
  assert.deepEqual(villagers(again).map(a => a.name), villagers(S).map(a => a.name));
  const t = S.towns[0], a = villagers(S)[0];
  const streams = JSON.stringify([S.rng, S.prng, S.krng, S.hrng]);
  assert.equal(nameFor(S, a, t), nameFor(S, a, t));
  assert.equal(JSON.stringify([S.rng, S.prng, S.krng, S.hrng]), streams, 'naming draws from no random stream');
  // children born are named by the custom of the settlement they are born in
  runFor(S, 1800);
  const kids = villagers(S).filter(v => S.t - v.born < 1800);
  assert.ok(kids.length > 0 && kids.every(k => P.names[S.towns[k.home!.town].naming].includes(k.name)));
  assert.ok(S.chronicle.some(c => c.kind === 'birth' && /^The first child, \w+, was born in /.test(c.text)));
});

test('traditions set settlements apart: on alike land, the one founded second takes up another custom and feast its land allows', () => {
  // seed 2: both settlements stand on land that suggests burial and a harvest festival (wood 0.35 and 0.30, little water)
  const S = createState(content, 2, { planner: true, people: true, seasons: true, settlements: 2 });
  const [a, b] = S.towns;
  assert.equal(landCustom(S, a), 'burial'); assert.equal(landCustom(S, b), 'burial');
  assert.equal(landFeast(S, a), 'harvest'); assert.equal(landFeast(S, b), 'harvest');
  assert.equal(a.custom, 'burial');
  assert.equal(b.custom, 'cremation', 'the second takes to the pyre, its land wooded enough for one');
  assert.deepEqual(a.feasts, ['harvest']); assert.deepEqual(b.feasts, ['midwinter']);
  assert.equal(b.naming, 'trees', 'and names its children by its custom');
  assert.ok(b.why.custom?.includes(a.name) && b.why.feast?.includes(a.name), 'it says whom it set itself apart from');
  assert.ok(S.chronicle.some(c => c.town === b.id && c.kind === 'custom' && c.text.includes(`unlike ${a.name}`)));
  // land that allows nothing else keeps what it suggests: with no leeway at all, both bury
  const strict = { ...content, tuning: { ...content.tuning, people: { ...P, apart: 0 } } };
  const T = createState(strict, 2, { planner: true, people: true, seasons: true, settlements: 2 });
  assert.deepEqual(T.towns.map(t => t.custom), ['burial', 'burial']);
  assert.deepEqual(T.towns.map(t => t.feasts[0]), ['harvest', 'harvest']);
  // and a settlement whose land suggests another custom than its neighbour's keeps it as before
  const W = createState(content, 31337, { planner: true, people: true, settlements: 2 });
  assert.deepEqual(W.towns.map(t => t.custom), W.towns.map(t => landCustom(W, t)));
});

test('a craft: a settlement takes up the trade of a master in a trade no other settlement works, and it works faster there', () => {
  const S = createState(content, 1847, { planner: true, people: true, settlements: 2 });
  const [a, b] = S.towns;
  assert.equal(a.craft, null);
  // a farm of the first settlement's (its yard standing in for one, before any is built)
  const fa = { ...S.bmap.get(a.store)!, type: 'farm' };
  const w = villagers(S).find(v => v.home?.town === a.id)!, v = villagers(S).find(x => x.home?.town === b.id)!;
  const before = skillPace(S, w, fa);
  takeCraft(S, a, w, fa.type);
  assert.equal(a.craft, fa.type);
  assert.ok(isCraft(S, fa));
  assert.ok(Math.abs(skillPace(S, w, fa) - before * (1 + P.craftPace)) < 1e-9, 'its workplaces of the craft work `craft_pace` faster');
  assert.ok(S.chronicle.some(c => c.town === a.id && c.kind === 'craft' && c.text.includes('takes pride in its')));
  // another settlement cannot take up a craft one already holds, and a school is no craft
  takeCraft(S, b, v, fa.type);
  assert.equal(b.craft, null);
  assert.equal(craftable(S, 'school'), false);
  assert.equal(craftable(S, 'bakery'), true);
  // left to themselves, settlements take up crafts as their people master trades, never the same one
  // (within 3000 seconds: the first came at 2000 here, and at 2500 once the planner stopped building smithies that stand needing iron ore)
  const R = createState(content, 2, { planner: true, people: true, seasons: true, settlements: 2 });
  runFor(R, 3000);
  const crafts = R.towns.map(t => t.craft).filter(Boolean);
  assert.ok(crafts.length >= 1, 'a craft was taken up');
  assert.equal(new Set(crafts).size, crafts.length);
  // without people there are no crafts, and nothing runs faster
  const off = createState(content, 1847, { planner: true });
  off.towns[0].craft = 'farm';
  assert.equal(isCraft(off, off.buildings.find(x => x.type === 'farm') ?? fa), false);
});

test('a custom giving way stays apart where it can: a people of the sea with no dock takes to the pyre beside a burying neighbour', () => {
  const S = createState(content, 4, { planner: true, people: true, settlements: 2 });
  const [a, b] = S.towns;
  a.custom = 'burial'; b.custom = 'ship';
  assert.equal(giveWay(S, b), 'cremation');
  a.custom = 'cremation';
  assert.equal(giveWay(S, b), 'burial');
  b.custom = 'burial';
  assert.equal(giveWay(S, b), 'cremation');
});

test('a version 31 save is upgraded to version 32: its settlements keep their customs, feasts and names, take up crafts as they go, and it plays on', () => {
  const file = JSON.parse(readFileSync(new URL('./fixtures/save-v31.json', import.meta.url), 'utf8')) as SaveFile;
  assert.equal(file.version, 31);
  const S = loadGame(content, file);
  const was = file.state.towns as { custom: string; feasts: string[]; naming: string }[];
  assert.deepEqual(S.towns.map(t => [t.custom, t.feasts, t.naming]), was.map(t => [t.custom, t.feasts, t.naming]));
  assert.ok(S.towns.every(t => t.craft === null && Object.keys(t.why).length === 0));
  runFor(S, 60);
  const text = (s: State) => JSON.stringify(saveGame(s));
  assert.equal(text(loadGame(content, text(S))), text(S));
});
