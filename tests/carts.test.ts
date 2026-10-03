import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../src/content/node.ts';
import { createState, placeBuilding, runFor, loadGame, saveGame } from '../src/sim/index.ts';
import { centre, findSpot } from '../src/gates/kit.ts';
import { pressure } from '../src/sim/knowledge.ts';

const content = loadContent();

test('the cart shed must be thought of, and distance is a need only with carts on', () => {
  const S = createState(content, 1847, { carts: true });
  assert.ok(!('cart_shed' in S.towns[0].knows));
  S.towns[0].reach = content.tuning.knowledge.distanceFrom + content.tuning.knowledge.distanceSpan;
  assert.equal(pressure(S, S.towns[0], 'distance'), 1);
  const off = createState(content, 1847, {});
  off.towns[0].reach = 999;
  assert.equal(pressure(off, off.towns[0], 'distance'), 0);
});

test('a carter takes a cart for a long, big load and brings it back', () => {
  const S = createState(content, 1847, { carts: true, planner: true });
  const L = content.tuning.logistics;
  const at = findSpot(S, 'cart_shed', centre(S), 10)!;
  const shed = placeBuilding(S, 'cart_shed', at.x, at.y, true)!;
  shed.town = 0;
  runFor(S, 1800);
  assert.ok(S.stats.cartDeliveries > 0, 'some loads went by cart');
  assert.ok(S.stats.longGoodsByCart > 0);
  const out = S.agents.filter(a => a.cart === shed.id).length;
  assert.ok(out <= content.blueprints.cart_shed.carts, `${out} carts out`);
  for (const a of S.agents) if (a.cart !== null) assert.ok(a.task, 'only a carter on a job has a cart');
  void L;
});

test('a game with carts saves and loads', () => {
  const S = createState(content, 1847, { carts: true, planner: true });
  runFor(S, 120);
  S.towns[0].reach = 17;
  const back = loadGame(content, saveGame(S));
  assert.equal(back.carts, true);
  assert.equal(back.towns[0].reach, 17);
});
