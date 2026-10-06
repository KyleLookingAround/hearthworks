import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../src/content/node.ts';
import { createState, runFor, saveGame, type State } from '../src/sim/index.ts';
import { causeOf, knowledgeProblem, landOf, problemCount, statusText, storesOf, townView, waitsOn } from '../src/ui/readouts.ts';

const content = loadContent();
const world = () => createState(content, 1847, { planner: true, settlements: 2, seasons: true, trade: true, people: true, farms: true, hardship: true, carts: true });

test('reading a settlement leaves every run as it was', () => {
  const plain = world(), read = world();
  runFor(plain, 600);
  // the interface reads between ticks: the card, the badges and the goods bar, every tick
  let n = 0;
  runFor(read, 600, S => {
    for (const t of S.towns) townView(S, t);
    for (const b of S.buildings) { causeOf(S, b); statusText(S, b); }
    storesOf(S, null);
    // the build bar's marks, now and then
    if (n++ % 50 === 0) for (const t of S.towns) for (const B of Object.values(content.blueprints)) waitsOn(S, t, B);
  });
  assert.equal(JSON.stringify(saveGame(read)), JSON.stringify(saveGame(plain)));
});

test("each settlement's stores are its own, and together they are the world's", () => {
  const S = world();
  runFor(S, 300);
  const all = storesOf(S, null), parts = S.towns.map(t => storesOf(S, t.id));
  for (const g in all) assert.equal(parts.reduce((n, p) => n + (p[g] || 0), 0), all[g], g);
  assert.ok(parts.every(p => (p.logs || 0) > 0), 'each yard holds logs of its own');
});

test('the card counts villagers, hands and beds of its settlement only', () => {
  const S = world();
  runFor(S, 300);
  const views = S.towns.map(t => townView(S, t));
  assert.equal(views.reduce((n, v) => n + v.pop, 0), S.agents.filter(a => a.kind === 'villager' && a.home).length);
  for (const v of views) {
    assert.ok(v.workers + v.carriers + v.children <= v.pop);
    assert.ok(v.idle <= v.carriers);
    assert.ok(v.free <= v.beds);
    assert.equal(v.status, v.town.planner.status);
    assert.ok(problemCount(v) >= 0);
  }
});

test('badges are told apart by cause, and a workplace resting with enough in store is no worker short', () => {
  const S: State = world();
  runFor(S, 120);
  const b = S.buildings.find(o => !o.site && content.blueprints[o.type].workers && Object.keys(content.blueprints[o.type].output).length)!;
  const as = (t: string, l: 'ok' | 'warn' | 'bad' | 'wait') => { b.status = { t, l }; return causeOf(S, b); };
  assert.equal(as('Needs logs', 'bad'), 'input');
  assert.equal(as('Output full, waiting for a carrier', 'warn'), 'full');
  assert.equal(as('Enough in store: resting', 'wait'), 'resting');
  assert.equal(as('On fire!', 'bad'), 'trouble');
  assert.equal(as('Working', 'ok'), null);
  assert.match(as('No worker free', 'bad') ?? '', /^(worker|resting)$/);
  assert.equal(statusText(S, b).t === 'Resting: enough in store', causeOf(S, b) === 'resting');
});

test('an unknown building says what it waits on, and cannot go on the land of a settlement that does not know it', () => {
  const S = world(), t = S.towns[0], yard = S.bmap.get(t.store)!;
  const B = content.blueprints.university, known = content.blueprints.sawmill;
  assert.ok(!('university' in t.knows));
  assert.match(waitsOn(S, t, B)!, /has not thought of the University yet/);
  assert.ok(waitsOn(S, t, B, true)!.length < 20, 'a few words for the build bar');
  assert.equal(waitsOn(S, t, known), null);
  assert.equal(landOf(S, 'university', yard.x, yard.y)?.id, t.id);
  assert.match(knowledgeProblem(S, 'university', yard.x, yard.y)!, /Hearth's land, and Hearth does not know the University/);
  assert.equal(knowledgeProblem(S, 'sawmill', yard.x, yard.y), null);
});
