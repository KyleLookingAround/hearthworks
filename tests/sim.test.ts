import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../src/content/node.ts';
import { createState, demolish, runFor, type State } from '../src/sim/index.ts';
import { hypot } from '../src/sim/core.ts';
import { build, centre, standardMetrics } from '../src/gates/kit.ts';

const content = loadContent();

function scripted(seed: number): State {
  const S = createState(content, seed);
  const c = centre(S);
  build(S, 'forester', c);
  build(S, 'sawmill', { x: c.x, y: c.y + 4 });
  build(S, 'farm', { x: c.x + 5, y: c.y + 5 });
  build(S, 'bakery', { x: c.x - 4, y: c.y + 5 });
  runFor(S, 240);
  return S;
}

function noNegativeBooks(S: State) {
  for (const b of S.buildings) for (const book of ['inv', 'incoming', 'reserved'] as const) {
    for (const [k, v] of Object.entries(b[book])) assert.ok(v >= 0, `${b.type}#${b.id} ${book}.${k} = ${v}`);
  }
}

test('same seed and commands give the same town', () => {
  const a = scripted(1847), b = scripted(1847);
  assert.deepEqual(standardMetrics(a), standardMetrics(b));
  assert.deepEqual(a.agents.map(x => [x.x.toFixed(4), x.y.toFixed(4)]), b.agents.map(x => [x.x.toFixed(4), x.y.toFixed(4)]));
});

test('different seeds give different islands', () => {
  const a = createState(content, 1), b = createState(content, 2);
  assert.notDeepEqual(Array.from(a.world.ground), Array.from(b.world.ground));
});

test('reservations never go negative, even when buildings are demolished mid-job', () => {
  const S = scripted(42);
  noNegativeBooks(S);
  const mill = S.buildings.find(b => b.type === 'sawmill')!;
  demolish(S, mill);
  runFor(S, 120);
  noNegativeBooks(S);
  assert.ok(!S.agents.some(a => a.task && (a.task.src === mill || a.task.dst === mill) && a.state === 'toSrc'), 'no carrier still heading to fetch from a demolished building');
});

test('a starving house eventually loses a resident', () => {
  const S = createState(content, 7);
  for (const b of S.buildings) b.inv = {};
  runFor(S, content.tuning.needs.eatEverySeconds + content.tuning.needs.leaveAfterHungrySeconds + 30);
  assert.ok(S.stats.departures >= 1);
});

test('the sim measures distances exactly as Math.hypot does', () => {
  let seed = 7;
  const r = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const same = (x: number, y: number) => Object.is(hypot(x, y), Math.hypot(x, y));
  for (let x = -60; x <= 60; x += 0.5) for (let y = -40; y <= 40; y += 0.5) assert.ok(same(x, y), `${x}, ${y}`);
  for (let i = 0; i < 200000; i++) { const x = (r() - 0.5) * 1200, y = (r() - 0.5) * 900; assert.ok(same(x, y), `${x}, ${y}`); }
  for (const [x, y] of [[0, 0], [-0, 0], [-0, -0], [NaN, 1], [1, NaN], [Infinity, NaN], [-Infinity, 2], [1e-320, 1e-320], [1e300, 1e300], [3, 4]]) assert.ok(same(x, y), `${x}, ${y}`);
});
