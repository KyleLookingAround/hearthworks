import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../src/content/node.ts';
import { createState, placeBuilding, runFor, villagers, type State } from '../src/sim/index.ts';
import { build, centre, standardMetrics, storeOf } from '../src/gates/kit.ts';

const content = loadContent();
const planned = (S: State) => S.buildings.filter(b => b.reason);

test('an urgent site gets the scarce planks before an older, expensive one', () => {
  const S = createState(content, 1847);
  storeOf(S).inv.planks = 6;
  const c = centre(S);
  // the depot sits beside storage and the sawmill further off, so carriers favour the depot on distance alone
  const depot = build(S, 'depot', { x: c.x + 4, y: c.y - 3 });
  const mill = build(S, 'sawmill', { x: c.x - 9, y: c.y + 6 });
  mill.priority = 5;
  while (mill.site && S.t < 60) runFor(S, 0.5);
  assert.equal(mill.site, false, 'the sawmill was built');
  assert.equal((depot.inv.planks || 0) + (depot.incoming.planks || 0), 0, 'the depot took none of the six planks');
});

test('with equal priority the older site is supplied first', () => {
  const S = createState(content, 1847);
  storeOf(S).inv.planks = 6;
  const c = centre(S);
  const mill = build(S, 'sawmill', { x: c.x - 9, y: c.y + 6 });
  const depot = build(S, 'depot', { x: c.x + 4, y: c.y - 3 });
  while (mill.site && S.t < 60) runFor(S, 0.5);
  assert.equal(mill.site, false);
  assert.equal((depot.inv.planks || 0) + (depot.incoming.planks || 0), 0);
});

test('the planner is off unless asked for, so scripted scenarios stay scripted', () => {
  const S = createState(content, 1847);
  const n = S.buildings.length;
  runFor(S, 120);
  assert.equal(S.buildings.length, n);
  assert.equal(S.planner.placed, 0);
});

test('the planner is deterministic', () => {
  const a = createState(content, 42, { planner: true }), b = createState(content, 42, { planner: true });
  runFor(a, 400); runFor(b, 400);
  assert.deepEqual(standardMetrics(a), standardMetrics(b));
  assert.deepEqual(planned(a).map(x => [x.type, x.x, x.y]), planned(b).map(x => [x.type, x.x, x.y]));
});

test('the planner keeps one site open at a time, says why, and starts with food', () => {
  const S = createState(content, 7, { planner: true });
  let most = 0;
  runFor(S, 600, s => { most = Math.max(most, s.buildings.filter(b => b.site && b.reason).length); });
  assert.equal(most, 1);
  const ps = planned(S);
  assert.ok(ps.length >= 6, `planned ${ps.length}`);
  assert.ok(['farm', 'bakery'].includes(ps[0].type), `first plan was a ${ps[0].type}`);
  assert.match(ps[0].reason, /bread/);
  for (const b of ps) assert.ok(b.priority > 0);
});

test('planned buildings never touch another building, except homes set wall to wall in rows', () => {
  const S = createState(content, 99, { planner: true });
  runFor(S, 900);
  const touch = (a: { x: number; y: number; w: number; h: number }, b: typeof a) =>
    a.x - 1 < b.x + b.w && b.x < a.x + a.w + 1 && a.y - 1 < b.y + b.h && b.y < a.y + a.h + 1;
  const home = (b: { type: string }) => S.content.blueprints[b.type].homes > 0;
  for (const p of planned(S)) for (const o of S.buildings) if (o !== p && !(home(p) && home(o))) assert.ok(!touch(p, o), `${p.type}@${p.x},${p.y} touches ${o.type}@${o.x},${o.y}`);
});

test('switching the planner off stops new plans and leaves hand placement alone', () => {
  const S = createState(content, 1847, { planner: true });
  runFor(S, 120);
  S.planner.on = false;
  const n = S.planner.placed;
  const c = centre(S);
  const mine = placeBuilding(S, 'house', Math.round(c.x) + 8, Math.round(c.y) + 8, false);
  runFor(S, 300);
  assert.equal(S.planner.placed, n);
  assert.equal(mine?.reason, '');
  assert.ok(villagers(S).length >= 5);
});

test('planners as people: a town hall with its planner at work lets a settlement build more at once, a master planner more still', async () => {
  const { atOnce, openSites } = await import('../src/sim/planner.ts');
  const { findSpot } = await import('../src/sim/index.ts');
  const P = content.tuning.planner;
  const S = createState(content, 1847, { planner: true, people: true, map: 'landmass', size: 'l' });
  const t = S.towns[0];
  assert.equal(atOnce(S, t), 1, 'one site at a time without a hall');
  const at = findSpot(S, 'town_hall', centre(S), 30)!;
  const hall = placeBuilding(S, 'town_hall', at.x, at.y, true)!;
  let most = 0, staffed = false;
  runFor(S, 900, s => {
    const w = hall.worker !== null ? s.amap.get(hall.worker) : undefined;
    if (w?.state === 'working') staffed = true;
    most = Math.max(most, openSites(s, t));
  });
  assert.ok(staffed, 'a planner sat at the desk');
  const w = S.amap.get(hall.worker!)!;
  assert.equal(atOnce(S, t), 1 + P.hallSites + ((w.skill.town_hall || 0) >= content.tuning.people.expertAt ? P.hallMasterSites : 0));
  w.skill.town_hall = 1;
  assert.equal(atOnce(S, t), 1 + P.hallSites + P.hallMasterSites, 'a master planner keeps more open');
  assert.ok(most >= 2, `kept ${most} of its own sites open at once`);
});

test('without people there are no planners as people: no hall is wanted', () => {
  const S = createState(content, 1847, { planner: true, map: 'landmass', size: 'l' });
  runFor(S, 1800);
  assert.ok(!S.buildings.some(b => content.blueprints[b.type].hall));
});
