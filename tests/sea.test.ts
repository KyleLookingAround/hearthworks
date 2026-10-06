import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../src/content/node.ts';
import { createState, dims, placeBuilding, runFor } from '../src/sim/index.ts';
import { chooseSpot, clearShore } from '../src/sim/planner.ts';
import { ZONES } from '../src/sim/types.ts';

const content = loadContent();

test('the archipelago is a map a player can pick', () => {
  const M = content.maps.archipelago;
  assert.ok(M, 'archipelago map');
  const S = createState(content, 1847, { map: 'archipelago', size: 's' });
  assert.equal(S.towns.length, 1);
});

test('a settlement whose island is full comes up with the dock and founds a colony across the sea', () => {
  const S = createState(content, 1847, { planner: true, settlers: true, trade: true, map: 'islands', size: 'm' });
  runFor(S, 2400);
  const colony = S.towns.find(t => t.overseas);
  assert.ok(colony, 'a colony across the water');
  assert.equal(colony!.mother, 0);
  assert.ok('dock' in S.towns[0].knows, 'the mother knows the dock');
  assert.ok(S.chronicle.some(c => c.kind === 'settled' && c.text.includes('across the sea')));
});

test('a dock with no shore left clears a workshop from the shore, and may stand beside worn paths', () => {
  const S = createState(content, 1847, { planner: true, settlers: true, map: 'islands', size: 'm' });
  const town = S.towns[0], W = S.world, store = S.bmap.get(town.store)!;
  const spot = chooseSpot(S, 'dock', town)!;
  assert.ok(spot, 'the island has a shore for a dock');
  // a worn path beside the spot does not keep the dock off it
  W.road[(spot.y - 1) * W.w + spot.x] = 1;
  assert.deepEqual(chooseSpot(S, 'dock', town), spot);
  // keep every other shore off limits, then build a workshop over the spot
  const NB = 1 + ZONES.indexOf('nobuild');
  const foot = dims(content.blueprints.dock, spot.rot);
  for (let y = 0; y < W.h; y++) for (let x = 0; x < W.w; x++) if (x < spot.x || y < spot.y || x >= spot.x + foot.w || y >= spot.y + foot.h) W.zone[y * W.w + x] = NB;
  const shop = placeBuilding(S, 'weaver', spot.x, spot.y, true)!;
  shop.town = town.id;
  assert.equal(chooseSpot(S, 'dock', town), null, 'no shore is free');
  const planks = store.inv.planks || 0;
  const cleared = clearShore(S, town, content.blueprints.dock)!;
  assert.ok(cleared, 'the workshop comes down for the dock');
  assert.equal(cleared.cut, shop);
  assert.ok(shop.dead && !S.buildings.includes(shop));
  assert.ok(placeBuilding(S, 'dock', cleared.spot.x, cleared.spot.y, false, cleared.spot.rot), 'the dock goes where the workshop stood');
  assert.equal((store.inv.planks || 0) - planks, Math.floor((content.blueprints.weaver.cost.planks || 0) * content.tuning.planner.salvageShare));
});

test('the sea maps have shallows along every shore and reefs out at sea that never close off any water', async () => {
  const { findPath } = await import('../src/sim/path.ts');
  const Z = content.tuning.sea;
  for (const map of ['islands', 'archipelago', 'coast']) {
    const S = createState(content, 7, { map, size: 'm' });
    const w = S.world, N = w.w * w.h;
    let reefs = 0;
    for (let i = 0; i < N; i++) {
      if (w.ground[i]) { assert.equal(w.sea[i], 0); continue; }
      const x = i % w.w, y = (i / w.w) | 0;
      let shore = false;
      for (let j = -1; j <= 1; j++) for (let k = -1; k <= 1; k++) { const xx = x + k, yy = y + j; if (xx >= 0 && yy >= 0 && xx < w.w && yy < w.h && w.ground[yy * w.w + xx]) shore = true; }
      if (shore) assert.equal(w.sea[i], 1, `${map}: water beside land is shallow`);
      if (w.sea[i] === 2) reefs++;
    }
    assert.ok(reefs > 0, `${map} has reefs`);
    // every stretch of water is still one without its reefs: label water with and without them and compare
    const label = (open: (i: number) => boolean) => {
      const id = new Int32Array(N).fill(-1); let c = 0;
      for (let s = 0; s < N; s++) {
        if (id[s] >= 0 || !open(s)) continue;
        const q = [s]; id[s] = c;
        while (q.length) { const i = q.pop()!, x = i % w.w; for (const j of [x > 0 ? i - 1 : -1, x < w.w - 1 ? i + 1 : -1, i - w.w, i + w.w]) if (j >= 0 && j < N && id[j] < 0 && open(j)) { id[j] = c; q.push(j); } }
        c++;
      }
      return c;
    };
    assert.equal(label(i => !w.ground[i] && w.sea[i] !== 2), label(i => !w.ground[i]), `${map}: no water is closed off by reefs`);
    assert.ok(Z.reefFromTiles > Z.shallowTiles);
  }
  // the lone isle has neither
  const L = createState(content, 7);
  assert.ok(L.world.sea.every(v => v === 0));
  // boats never row over a reef, and go round
  const S = createState(content, 7, { map: 'islands', size: 'm' });
  const w = S.world;
  let reef = -1;
  for (let i = 0; i < w.w * w.h && reef < 0; i++) if (w.sea[i] === 2) reef = i;
  const rx = reef % w.w, ry = (reef / w.w) | 0;
  // a sea route past the reef, from water to the nearest land beyond it
  const p = findPath(w, rx - 6, ry, rx + 6, ry, { launchAnywhere: true });
  if (p) assert.ok(!p.some(([x, y]) => w.sea[y * w.w + x] === 2), 'no reef on the route');
});

test('shallows slow boats: a row through shallows takes longer than the same row out at sea', async () => {
  const { makeAgent, updateAgent } = await import('../src/sim/agents.ts');
  const S = createState(content, 7, { map: 'islands', size: 'm' });
  const w = S.world;
  // a stretch of open sea, twelve tiles long
  let y0 = -1, x0 = -1;
  for (let y = 2; y < w.h - 2 && y0 < 0; y++) for (let x = 2; x < w.w - 14 && y0 < 0; x++) {
    let ok = true;
    for (let k = 0; k <= 12 && ok; k++) { const i = y * w.w + x + k; if (w.ground[i] || w.sea[i]) ok = false; }
    if (ok) { y0 = y; x0 = x; }
  }
  assert.ok(y0 >= 0, 'a stretch of open sea');
  const row = () => {
    const a = makeAgent(S, 'villager', x0 + 0.5, y0 + 0.5);
    a.state = 'toWork';
    a.path = Array.from({ length: 12 }, (_, k) => [x0 + k + 1, y0] as [number, number]);
    let n = 0;
    while (a.path.length && n < 10000) { updateAgent(S, a, 0.05); n++; }
    return n;
  };
  const deep = row();
  for (let k = 0; k <= 12; k++) w.sea[y0 * w.w + x0 + k] = 1;
  const shallow = row();
  assert.ok(Math.abs(shallow / deep - 1 / content.tuning.sea.shallowSpeed) < 0.15, `shallow ${shallow} against deep ${deep}`);
});

test('with charts on, a settlement charts its own island and what it sees, and settles only on charted land', async () => {
  const { islesOf, isleAt } = await import('../src/sim/sea.ts');
  const { neighbourSite } = await import('../src/sim/worldgen.ts');
  const S = createState(content, 1847, { planner: true, settlers: true, charts: true, map: 'islands', size: 'm' });
  runFor(S, 2);
  const t = S.towns[0], store = S.bmap.get(t.store)!;
  assert.ok(t.charted.includes(isleAt(S, store.x, store.y)), 'its own island');
  assert.ok(t.charted.length < islesOf(S).count, 'not every island');
  for (let k = 0; k < 20; k++) {
    const site = neighbourSite(S, t, false, true);
    if (site) assert.ok(t.charted.includes(isleAt(S, site.x, site.y + 1)), 'a site on charted land');
  }
  // without charts nothing changes: no charts are kept
  const N = createState(content, 1847, { planner: true, settlers: true, map: 'islands', size: 'm' });
  runFor(N, 2);
  assert.equal(N.towns[0].charted.length, 0);
});

test('an explorer rows from the dock to the nearest uncharted island and comes home to chart it', async () => {
  const { isleAt, sendExplorer } = await import('../src/sim/sea.ts');
  const { chooseSpot } = await import('../src/sim/planner.ts');
  const S = createState(content, 1847, { planner: true, settlers: true, charts: true, map: 'islands', size: 'm' });
  runFor(S, 2);
  const t = S.towns[0], before = t.charted.length;
  const spot = chooseSpot(S, 'dock', t)!;
  const dock = placeBuilding(S, 'dock', spot.x, spot.y, true, spot.rot)!;
  dock.town = t.id;
  t.explore = true;
  const a = sendExplorer(S, t)!;
  assert.ok(a, 'an explorer sets out');
  const [tx, ty] = a.visit!.explore!, target = isleAt(S, tx, ty);
  assert.ok(!t.charted.includes(target), 'for an island not yet charted');
  assert.equal(sendExplorer(S, t), null, 'one explorer at a time');
  for (let k = 0; k < 900 && a.visit; k++) runFor(S, 1);
  assert.equal(a.visit, null, 'home again');
  assert.ok(t.charted.includes(target), 'the island is charted');
  assert.ok(t.charted.length > before);
  assert.ok(S.chronicle.some(c => c.kind === 'charted' && c.town === t.id));
  assert.equal(S.stats.voyages, 1);
});

test('a game with charts and an explorer at sea saves and loads, and plays on as if it had never stopped', async () => {
  const { sendExplorer } = await import('../src/sim/sea.ts');
  const { chooseSpot } = await import('../src/sim/planner.ts');
  const { loadGame, saveGame } = await import('../src/sim/index.ts');
  const S = createState(content, 1847, { planner: true, settlers: true, charts: true, map: 'islands', size: 'm' });
  runFor(S, 2);
  const t = S.towns[0], spot = chooseSpot(S, 'dock', t)!;
  placeBuilding(S, 'dock', spot.x, spot.y, true, spot.rot)!.town = t.id;
  t.explore = true;
  assert.ok(sendExplorer(S, t));
  runFor(S, 20);
  const text = (X: typeof S) => JSON.stringify(saveGame(X));
  const L = loadGame(content, text(S));
  assert.ok(L.charts && L.agents.some(a => a.visit?.explore));
  runFor(S, 120); runFor(L, 120);
  assert.equal(text(L), text(S));
});
