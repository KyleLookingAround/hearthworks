import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../src/content/node.ts';
import { distBB } from '../src/sim/world.ts';
import { bp, createState, placeBuilding, runFor, loadGame, saveGame } from '../src/sim/index.ts';
import { findTask } from '../src/sim/logistics.ts';
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

test('a cart on a long haul goes round: it fills up for homes asking near its first drop and tops up the rest', () => {
  const S = createState(content, 1847, { carts: true });
  const L = content.tuning.logistics, store = S.bmap.get(S.towns[0].store)!, c = centre(S);
  // the founders' homes have their bread; only the far homes ask
  for (const b of S.buildings) if (bp(S, b).homes) b.inv = { bread: 3 };
  store.inv = { bread: 30 };
  // three homes side by side, far from the only storage yard; a shed beside the yard
  const far = { x: c.x + 26, y: c.y };
  const homes = [0, 1, 2].map(() => { const at = findSpot(S, 'house', far, 8)!; const h = placeBuilding(S, 'house', at.x, at.y, true)!; h.town = 0; return h; });
  homes[2].inv.bread = 2;
  const at = findSpot(S, 'cart_shed', c, 10)!;
  const shed = placeBuilding(S, 'cart_shed', at.x, at.y, true)!;
  shed.town = 0;
  for (const h of homes) assert.ok(distBB(h, store) >= L.cartMinTiles && distBB(h, homes[0]) <= L.roundTiles);
  const a = S.agents.find(v => v.kind === 'villager')!;
  a.x = store.x; a.y = store.y; a.task = null; a.state = 'idle';
  assert.ok(findTask(S, a));
  const t = a.task!, load = t.n + t.round.reduce((s, r) => s + r.n, 0);
  assert.equal(t.item, 'bread');
  assert.equal(a.cart, shed.id, 'a cart for the round');
  assert.equal(load, L.cartCarry, 'a full cart');
  assert.ok(t.round.some(r => r.dst === homes[2]), 'the home with bread on the shelf is topped up on the way');
  assert.equal(store.reserved.bread, load);
  assert.equal(homes.reduce((s, h) => s + (h.incoming.bread || 0), 0), load);
  // it delivers to each in turn, and what is promised is only what carriers are bringing
  runFor(S, 120);
  assert.ok(homes.every(h => (h.inv.bread || 0) > 0));
  const promised = (h: typeof store) => S.agents.reduce((s, v) => { const k = v.task; if (!k || k.item !== 'bread') return s; return s + (k.dst === h ? k.n : 0) + k.round.reduce((m, r) => m + (r.dst === h ? r.n : 0), 0); }, 0);
  for (const h of homes) assert.equal(h.incoming.bread || 0, promised(h));
});
