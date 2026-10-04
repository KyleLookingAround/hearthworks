import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../src/content/node.ts';
import { createState, runFor, bp, ctr, findSpot, placeBuilding } from '../src/sim/index.ts';
import { spareOf, stockOf, wantOf } from '../src/sim/trade.ts';
import { importFrom } from '../src/sim/planner.ts';

const content = loadContent();

test('trade is off unless asked for, and nobody goes out to trade then', () => {
  const S = createState(content, 1847, { planner: true, settlements: 2 });
  assert.equal(S.trade, false);
  runFor(S, 600);
  assert.equal(S.stats.trades, 0);
});

test('a settlement spares only what it holds beyond its own needs, and keeps food for its people', () => {
  const S = createState(content, 1847, { planner: true, settlements: 2, trade: true });
  const t = S.towns[0], store = S.bmap.get(t.store)!;
  for (const g in store.inv) store.inv[g] = 0;
  store.inv.stone = 100;
  t.planner.use = { stone: 0.5, bread: 2 };
  t.planner.wants = {};
  const keep = content.tuning.trade.keep + 0.5 * content.tuning.trade.spareCover;
  assert.equal(spareOf(S, t).stone, Math.floor(100 - keep));
  store.inv.stone = 1;
  assert.ok(wantOf(S, t, 'stone') > 0, 'running low is a want');
  assert.equal(spareOf(S, t).stone, undefined);
  store.inv.bread = 5;
  assert.equal(spareOf(S, t).bread, undefined, 'bread for the homes stays home');
  assert.equal(stockOf(S, t).bread, 5);
});

test('porters carry spare goods to a neighbour and bring wanted ones back', () => {
  const S = createState(content, 1847, { planner: true, settlements: 2, trade: true });
  runFor(S, 1800);
  assert.ok(S.stats.trades > 0, 'loads were delivered');
  const [a, b] = S.towns;
  const out = (t: typeof a) => Object.values(t.trade.exported).reduce((s, n) => s + n, 0);
  const into = (t: typeof a) => Object.values(t.trade.imported).reduce((s, n) => s + n, 0);
  assert.equal(out(a) + out(b), into(a) + into(b), 'every load sent arrives');
  // nothing is created by trade: what one exports the other imports
  for (const g in a.trade.exported) assert.equal(a.trade.exported[g], b.trade.imported[g] ?? 0, g);
  for (const t of S.towns) for (const g in t.trade.imports) assert.ok(t.trade.imports[g] >= 0);
  assert.ok(S.chronicle.some(c => c.kind === 'trade'), 'the first trade is in the chronicle');
  void bp;
});

test('a settlement trades for what its neighbour makes rather than making it, while the imports come', () => {
  const S = createState(content, 1847, { planner: true, settlements: 2, trade: true });
  const [a, b] = S.towns, X = content.tuning.trade;
  assert.equal(importFrom(S, a, 'cloth', 0.1), null, 'nobody makes cloth yet');
  const spot = findSpot(S, 'weaver', ctr(S.bmap.get(b.store)!), 20)!;
  placeBuilding(S, 'weaver', spot.x, spot.y, true)!.town = b.id;
  assert.equal(importFrom(S, a, 'cloth', 0.1), b, 'its neighbour makes cloth');
  assert.equal(importFrom(S, b, 'cloth', 0.1), null, 'the maker makes its own');
  assert.equal(importFrom(S, a, 'planks', 0.1), null, 'the basics stay its own business');
  S.t += X.importPatienceSeconds;
  assert.equal(importFrom(S, a, 'cloth', 0.1), null, 'no imports came in time: it makes its own');
  a.trade.imports.cloth = 0.1 * X.importShare;
  assert.equal(importFrom(S, a, 'cloth', 0.1), b, 'imports keep coming: it keeps trading');
  S.trade = false;
  assert.equal(importFrom(S, a, 'cloth', 0.1), null, 'no trade, no specialising');
});
