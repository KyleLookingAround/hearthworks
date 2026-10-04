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
