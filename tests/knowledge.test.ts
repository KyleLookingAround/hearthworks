import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../src/content/node.ts';
import { createState, ctr, demolish, placeBuilding, runFor, villagers, type Content, type State } from '../src/sim/index.ts';
import { findSpot, standardMetrics } from '../src/gates/kit.ts';

const content = loadContent();
const K = content.tuning.knowledge;
const withTuning = (edit: (c: Content) => void): Content => { const c = structuredClone(content); edit(c); return c; };
const storeCentre = (S: State, i: number) => ctr(S.bmap.get(S.towns[i].store)!);

/** Put a finished Courier Depot beside a settlement's storage, as the player would. */
function handBuiltDepot(S: State, town = 0) {
  const at = findSpot(S, 'depot', storeCentre(S, town))!;
  return placeBuilding(S, 'depot', at.x, at.y, true)!;
}

test('settlements start with founding knowledge only: the depot has to be discovered', () => {
  const S = createState(content, 1847);
  const t = S.towns[0];
  assert.equal(t.name, content.tuning.start.names[0]);
  // (what belongs to an option of the world that is off, farms that grow, is not known at all)
  for (const B of Object.values(content.blueprints)) assert.equal(B.id in t.knows, !B.discovery && !B.option, B.id);
  assert.ok(content.blueprints.depot.discovery);
  const F = createState(content, 1847, { farms: true }).towns[0];
  for (const B of Object.values(content.blueprints)) assert.equal(B.id in F.knows, !B.discovery, B.id);
  assert.equal(t.knows.house.by, 'founders');
});

test('a neighbour is founded far enough away, reachable, with its own people', () => {
  const S = createState(content, 7, { settlements: 2 });
  assert.equal(S.towns.length, 2);
  const a = storeCentre(S, 0), b = storeCentre(S, 1);
  assert.ok(Math.hypot(a.x - b.x, a.y - b.y) >= content.tuning.start.neighbourMinDistance);
  assert.equal(villagers(S).filter(v => v.home?.town === 1).length, content.tuning.start.villagers);
  assert.ok(S.buildings.filter(x => x.town === 1).length >= 3);
});

test('building something by hand teaches it, and running it well proves it', () => {
  const S = createState(content, 1847);
  handBuiltDepot(S);
  runFor(S, 2);
  const k = S.towns[0].knows.depot;
  assert.equal(k.by, 'hand');
  assert.equal(k.verified.length, 0);
  runFor(S, K.verifySeconds + 2);
  assert.ok(k.verified.some(v => v.by === S.towns[0].name), 'proven in use');
});

test('discovered knowledge with nothing built from it is forgotten; founding knowledge never is', () => {
  const S = createState(content, 1847);
  const d = handBuiltDepot(S);
  runFor(S, 2);
  demolish(S, d);
  runFor(S, K.forgetAfterSeconds + 3);
  assert.ok(!('depot' in S.towns[0].knows));
  assert.equal(S.stats.forgotten, 1);
  assert.ok('bakery' in S.towns[0].knows, 'never built, but founding knowledge stays');
});

test('a village under strain invents; one at ease does not', () => {
  // haul_target -1 makes every village count as struggling; struggle_severity 2 makes none
  const strained = createState(withTuning(c => { c.tuning.knowledge.haulTarget = -1; c.blueprints.depot.discovery!.meanSeconds = 5; }), 1847);
  runFor(strained, 120);
  assert.equal(strained.towns[0].knows.depot?.by, strained.towns[0].name);
  assert.equal(strained.stats.invented, 1);
  const easy = createState(withTuning(c => { c.tuning.knowledge.struggleSeverity = 2; c.blueprints.depot.discovery!.meanSeconds = 5; }), 1847);
  runFor(easy, 120);
  assert.equal(easy.stats.invented, 0);
});

test('a visitor carries knowledge to the neighbour, keeping who thought of it', () => {
  // villages this small keep their people at home unless visits are allowed from the start
  const S = createState(withTuning(c => { c.tuning.knowledge.visitMinVillagers = 0; }), 42, { settlements: 2 });
  const [home, host] = S.towns;
  home.knows.depot = { by: home.name, at: 0, verified: [{ by: home.name, at: 0 }], from: null, learned: 0, used: 0 };
  let sawVisitor = false;
  runFor(S, K.visitEverySeconds * 3, s => { sawVisitor ||= villagers(s).some(a => a.state === 'visit'); });
  assert.ok(sawVisitor, 'someone walked over');
  const k = host.knows.depot;
  assert.ok(k, `${host.name} learned it`);
  assert.equal(k.by, home.name);
  assert.equal(k.from, home.name);
  assert.ok(k.verified.some(v => v.by === home.name), 'verifications travel with it');
  assert.ok(!k.verified.some(v => v.by === host.name), 'but the learner has not proven it yet');
});

test('two planning settlements are deterministic, and visitors never carry goods away', () => {
  const run = () => { const S = createState(content, 99, { planner: true, settlements: 2 }); runFor(S, 600); return S; };
  const a = run(), b = run();
  assert.deepEqual(standardMetrics(a), standardMetrics(b));
  assert.deepEqual(a.towns.map(t => Object.keys(t.knows)), b.towns.map(t => Object.keys(t.knows)));
  for (const v of villagers(a)) if (v.state === 'visit') assert.equal(v.carry, null);
});
