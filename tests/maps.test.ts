import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../src/content/node.ts';
import { createState, findPath, door, runFor, villagers } from '../src/sim/index.ts';

const content = loadContent();
const T = content.tuning.map;
const sizes = Object.keys(T.sizes);
const types = Object.keys(content.maps);

test('the standard world is the island at the standard size', () => {
  assert.equal(T.standardType, 'island');
  const S = createState(content, 1847);
  assert.deepEqual(S.setup, { map: 'island', size: T.standardSize, settlements: 1 });
  assert.equal(S.world.w, T.width);
  assert.equal(S.world.h, T.height);
});

test('every map type and size founds its settlements where they can be reached', () => {
  for (const map of types) for (const size of sizes) for (const seed of [1847, 7]) {
    if (content.maps[map].sizes && !content.maps[map].sizes!.includes(size)) continue;
    const n = 4;
    const S = createState(content, seed, { map, size, settlements: n });
    const where = `${map}/${size}/${seed}`;
    assert.equal(S.world.w, T.sizes[size].width, where);
    assert.ok(S.towns.length >= 2, `${where}: only ${S.towns.length} settlements`);
    const home = door(S.bmap.get(S.towns[0].store)!);
    // on foot where the map type says so; otherwise at least by boat
    const byBoat = content.maps[map].neighbours === 'anywhere';
    for (const t of S.towns.slice(1)) {
      const d = door(S.bmap.get(t.store)!);
      assert.ok(findPath(S.world, home.x, home.y, d.x, d.y, { launchAnywhere: byBoat }), `${where}: ${t.name} unreachable`);
    }
  }
});

test('map types have their own shapes', () => {
  const share = (map: string, f: (x: number, y: number, g: number) => boolean) => {
    const S = createState(content, 7, { map, size: 'medium' }), w = S.world;
    let n = 0, all = 0;
    for (let y = 0; y < w.h; y++) for (let x = 0; x < w.w; x++) { all++; if (f(x / w.w, y / w.h, w.ground[y * w.w + x])) n++; }
    return n / all;
  };
  assert.ok(share('island', (x, y, g) => (x < 0.05 || x > 0.95 || y < 0.05 || y > 0.95) && g === 0) > 0.15, 'island: sea at the edges');
  assert.ok(share('landmass', (x, y, g) => g === 2) > 0.7, 'landmass: mostly land');
  assert.ok(share('landmass', (x, y, g) => g === 0) > 0.02, 'landmass: some lakes');
  assert.ok(share('coast', (x, y, g) => x > 0.9 && g === 0) > 0.08, 'coast: sea in the east');
  assert.ok(share('coast', (x, y, g) => x < 0.4 && g === 2) > 0.3, 'coast: land in the west');
});

test('unknown map types and sizes are refused', () => {
  assert.throws(() => createState(content, 1, { map: 'moon' }), /unknown map type/);
  assert.throws(() => createState(content, 1, { size: 'vast' }), /unknown map size/);
  assert.throws(() => createState(content, 1, { map: 'islands', size: 'small' }), /not offered/);
});

test('two planning settlements on a medium landmass both grow and stay fed', () => {
  const S = createState(content, 42, { planner: true, settlements: 2, map: 'landmass', size: 'medium' });
  runFor(S, 600);
  for (const t of S.towns) assert.ok(villagers(S).filter(a => a.home?.town === t.id).length >= 8, `${t.name} grew`);
  assert.equal(S.stats.departures, 0);
  for (const t of S.towns) assert.ok(t.mood >= 0.6, `${t.name} mood ${t.mood}`);
});
