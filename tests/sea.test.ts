import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../src/content/node.ts';
import { createState, runFor } from '../src/sim/index.ts';

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
