import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadContent } from '../src/content/node.ts';
import { distBB } from '../src/sim/world.ts';
import { bp, createState, loadGame, placeBuilding, runFor, saveGame, waysOf, advise, type SaveFile, type State } from '../src/sim/index.ts';
import { findTask, hubFor, hubOf } from '../src/sim/logistics.ts';
import { centre, findSpot } from '../src/gates/kit.ts';

const content = loadContent();
const L = content.tuning.logistics;
const text = (S: State) => JSON.stringify(saveGame(S));

/** The first yard with bread to spare and a cart shed beside it; a second yard far off with a home beside it asking for bread. */
function district(seed = 1847) {
  const S = createState(content, seed, { carts: true });
  const store = S.bmap.get(S.towns[0].store)!, c = centre(S);
  for (const b of S.buildings) if (bp(S, b).homes) b.inv = { bread: 3 };
  store.inv = { bread: 30 };
  for (const dx of [30, -30, 34, -34]) {
    const at = findSpot(S, 'storage', { x: c.x + dx, y: c.y }, 6);
    if (!at) continue;
    const yard = placeBuilding(S, 'storage', at.x, at.y, true)!;
    yard.town = 0;
    const h = findSpot(S, 'house', { x: yard.x + 1, y: yard.y + 5 }, 6);
    if (!h) continue;
    const home = placeBuilding(S, 'house', h.x, h.y, true)!;
    home.town = 0; home.inv = { bread: 1 };
    const s = findSpot(S, 'cart_shed', c, 10)!;
    const shed = placeBuilding(S, 'cart_shed', s.x, s.y, true)!;
    shed.town = 0;
    return { S, store, yard, home, shed };
  }
  throw new Error('no room for a second district');
}

test('a district\'s yard is the hub of the homes around it, for goods from far off only', () => {
  const { S, store, yard, home } = district();
  assert.ok(distBB(home, yard) <= L.hubReach && distBB(yard, store) >= L.relayMinTiles);
  assert.equal(hubOf(S, home), yard, 'the yard nearest the home is its hub');
  assert.equal(hubFor(S, store, home, 'bread'), yard, 'bread from the far yard is handed on there');
  assert.equal(hubFor(S, yard, home, 'bread'), null, 'nothing is handed on at the yard it comes from');
  assert.equal(hubFor(S, store, yard, 'bread'), null, 'a store is no one\'s district');
});

test('a carter takes a cartload to the far district\'s yard, which then serves its homes on foot', () => {
  const { S, store, yard, home, shed } = district();
  const a = S.agents.find(v => v.kind === 'villager')!;
  a.x = store.x; a.y = store.y; a.task = null; a.state = 'idle';
  assert.ok(findTask(S, a));
  const t = a.task!, load = t.n + t.round.reduce((s, r) => s + r.n, 0);
  assert.equal(t.item, 'bread');
  assert.equal(a.cart, shed.id, 'by cart');
  assert.ok(load > L.villagerCarry && load <= L.cartCarry, `a cartload (${load})`);
  assert.ok(t.hub ? t.dst === yard : t.round.some(r => r.hub && r.dst === yard), 'the rest goes on to the far yard');
  runFor(S, 120);
  assert.ok(S.stats.handedOn > 0 && (S.towns[0].ways.handed || 0) > 0, 'goods were handed on');
  assert.ok((S.stats.ways.cart || 0) > 0);
  assert.ok((home.inv.bread || 0) + (home.incoming.bread || 0) >= 2, 'the home has its bread');
  const w = waysOf(S, S.towns[0])!;
  assert.ok(w.text.includes('by handcart') && w.handed > 0, w.text);
  const back = loadGame(content, text(S));
  assert.equal(text(back), text(S), 'hand-ons save and load');
});

test('without a cart nothing is handed on: a load two hands carry goes only to its own door', () => {
  const { S, store, yard, shed } = district();
  shed.site = true;
  const a = S.agents.find(v => v.kind === 'villager')!;
  a.x = store.x; a.y = store.y; a.task = null; a.state = 'idle';
  if (findTask(S, a)) {
    assert.equal(a.cart, null);
    assert.ok(!a.task!.hub && !a.task!.round.some(r => r.hub), 'no hand-on on foot');
    assert.notEqual(a.task!.dst, yard);
  }
});

test('the advisor points at hauling when long hauls go mostly on foot', () => {
  const S = createState(content, 1847, { carts: true });
  const t = S.towns[0];
  t.knows.cart_shed = { by: 'x', at: 0, verified: [], from: null, learned: 0, used: 0 };
  t.ways = { foot: 900, cart: 100, long: L.adviseLongHauls, longFoot: L.adviseLongHauls };
  assert.ok(advise(S, t, 9).some(s => s.includes('long hauls go on foot')));
  t.ways.longFoot = 0;
  assert.ok(!advise(S, t, 9).some(s => s.includes('long hauls go on foot')));
});

test('the version 30 fixture loads with no goods counted by way yet', () => {
  const file = JSON.parse(readFileSync(new URL('./fixtures/save-v30.json', import.meta.url), 'utf8')) as SaveFile;
  assert.equal(file.version, 30);
  const S = loadGame(content, file);
  assert.deepEqual(S.stats.ways, {});
  assert.equal(S.stats.handedOn, 0);
  assert.equal(S.stats.handedOnBelt, 0);
  assert.ok(S.towns.length > 0 && S.towns.every(t => Object.keys(t.ways).length === 0));
  runFor(S, 60);
  assert.ok(Object.keys(S.stats.ways).length > 0, 'goods are counted by way from now on');
  assert.equal(text(loadGame(content, text(S))), text(S));
});
