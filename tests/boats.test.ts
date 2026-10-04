import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../src/content/node.ts';
import { createState, door, placeBuilding, placeProblem, runFor, villagers, type State } from '../src/sim/index.ts';
import { findPath } from '../src/sim/path.ts';

const content = loadContent();
const storeDoor = (S: State, i: number) => door(S.bmap.get(S.towns[i].store)!);

/** A spot on the first settlement's island where a dock fits, nearest its storage yard. */
function dockSpot(S: State) {
  const home = storeDoor(S, 0), w = S.world;
  let best: { x: number; y: number } | null = null, bd = Infinity;
  for (let y = 1; y < w.h - 2; y++) for (let x = 1; x < w.w - 2; x++) {
    if (placeProblem(S, 'dock', x, y) !== null) continue;
    const d = door({ x, y, w: 2, h: 2 });
    if (!findPath(w, home.x, home.y, d.x, d.y)) continue;
    const dist = Math.hypot(x - home.x, y - home.y);
    if (dist < bd) { bd = dist; best = { x, y }; }
  }
  return best!;
}

test('the islands map can put neighbours out of reach on foot', () => {
  const S = createState(content, 7, { map: 'islands', size: 'standard', settlements: 2 });
  const a = storeDoor(S, 0), b = storeDoor(S, 1);
  assert.equal(findPath(S.world, a.x, a.y, b.x, b.y), null);
});

test('a dock must open onto water with open land beside its door', () => {
  const S = createState(content, 7, { map: 'islands', size: 'standard' }), w = S.world;
  // somewhere inland, with land all around
  let inland: { x: number; y: number } | null = null;
  for (let y = 2; y < w.h - 4 && !inland; y++) for (let x = 2; x < w.w - 4; x++) {
    let land = true;
    for (let j = y - 1; j <= y + 3 && land; j++) for (let k = x - 1; k <= x + 3; k++) if (!w.ground[j * w.w + k] || w.bgrid[j * w.w + k] !== -1) { land = false; break; }
    if (land) { inland = { x, y }; break; }
  }
  assert.match(placeProblem(S, 'dock', inland!.x, inland!.y) ?? '', /has to open onto water/);
  const at = dockSpot(S);
  assert.equal(placeProblem(S, 'dock', at.x, at.y), null);
});

test('with a dock, people row across and land on the far shore; without one nobody rows', () => {
  const S = createState(content, 7, { map: 'islands', size: 'standard', settlements: 2 });
  const a = storeDoor(S, 0), b = storeDoor(S, 1), w = S.world;
  assert.equal(findPath(w, a.x, a.y, b.x, b.y), null, 'no boats before a dock');
  const at = dockSpot(S);
  placeBuilding(S, 'dock', at.x, at.y, true);
  const out = findPath(w, a.x, a.y, b.x, b.y);
  assert.ok(out, 'a way across by boat');
  assert.ok(out!.some(([x, y]) => w.ground[y * w.w + x] === 0), 'part of it on water');
  // the far side has no dock: getting home again takes the boat they came in
  assert.equal(findPath(w, b.x, b.y, a.x, a.y), null);
  assert.ok(findPath(w, b.x, b.y, a.x, a.y, { launchAnywhere: true }));
});

test('neighbours across water invent the dock, build it, and their visitors cross', () => {
  const S = createState(content, 7, { map: 'islands', size: 'standard', settlements: 2, planner: true });
  let crossed = false;
  runFor(S, 900, s => { crossed ||= s.agents.some(a => a.visit && !s.world.ground[Math.floor(a.y) * s.world.w + Math.floor(a.x)]); });
  assert.ok(S.buildings.some(b => b.type === 'dock' && !b.site), 'a dock was built');
  assert.ok(crossed, 'a visitor rowed across');
  assert.ok(S.stats.taught >= 1, 'and taught the neighbours something');
  assert.equal(S.stats.departures, 0);
  for (const t of S.towns) assert.ok(villagers(S).filter(v => v.home?.town === t.id).length >= 9, `${t.name} grew`);
});

test('someone left out on open water rows on to shore, and a carrier cut off from its storage yard does not close the yard', async () => {
  const { blame } = await import('../src/sim/logistics.ts');
  const S = createState(content, 4, { map: 'islands', size: 'm' });
  const W = S.world, yard = S.bmap.get(S.towns[0].store)!, d = door(yard);
  // open water far from any dock, with no docks at all
  let at = -1;
  for (let i = 0; i < W.ground.length && at < 0; i++) { const x = i % W.w, y = (i / W.w) | 0; if (!W.ground[i] && x > 2 && y > 2 && x < W.w - 3 && y < W.h - 3 && Math.hypot(x - d.x, y - d.y) < 40) at = i; }
  assert.ok(at >= 0 && W.docks === 0);
  const sx = at % W.w, sy = (at / W.w) | 0;
  assert.ok(findPath(W, sx, sy, d.x, d.y), 'afloat, they row to land and walk on');
  const a = S.agents.find(v => v.kind === 'villager')!;
  a.x = sx + 0.5; a.y = sy + 0.5;
  blame(S, a, yard);
  assert.equal(yard.noWay, null, 'the yard stays open to everyone else');
});
