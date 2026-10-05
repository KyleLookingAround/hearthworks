import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadContent } from '../src/content/node.ts';
import { createState, front, loadGame, placeBuilding, placeProblem, runFor, saveGame, type SaveFile, type State } from '../src/sim/index.ts';
import { ageNeeded, pressure } from '../src/sim/knowledge.ts';
import { beltBy, bestBelt } from '../src/sim/belts.ts';

const content = loadContent();
const text = (S: State) => JSON.stringify(saveGame(S));
const learn = (S: State, id: string) => { S.towns[0].knows[id] = { by: 'x', at: 0, verified: [], from: null, learned: S.t, used: S.t }; };

test('the conveyor is the Age of Clockwork\'s own, thought of once depots stand and carriers are still run off their feet', () => {
  const clock = content.eras.findIndex(E => E.id === 'clockwork'), B = content.blueprints.conveyor;
  assert.ok(B.paves && B.belt);
  assert.equal(ageNeeded({ content } as any, 'conveyor'), clock);
  assert.deepEqual(B.discovery?.after, ['depot']);
  assert.equal(B.discovery?.need, 'conveying');
  const strained = (age: number, depot: boolean) => {
    const S = createState(content, 1847, {});
    learn(S, 'depot');
    if (depot) { const t = S.towns[0], y = S.bmap.get(t.store)!; for (let r = 4; r < 20; r++) if (!placeProblem(S, 'depot', y.x + r, y.y)) { placeBuilding(S, 'depot', y.x + r, y.y, true); break; } }
    let known = false, p = 0;
    runFor(S, 1800, s => {
      const o = s.towns[0];
      // carriers held run off their feet, and the settlement held at the age asked
      o.haul = 1; o.age = age; o.levers.encourage = 'conveyor';
      p = Math.max(p, pressure(s, o, 'conveying'));
      if ('conveyor' in o.knows) known = true;
    });
    return { known, p };
  };
  const before = strained(clock - 1, true), noDepot = strained(clock, false), at = strained(clock, true);
  assert.equal(before.p, 1);
  assert.equal(before.known, false, 'not thought of before the age');
  assert.equal(noDepot.p, 0, 'no strain while no depot stands: the bots are the answer first');
  assert.equal(noDepot.known, false);
  assert.equal(at.known, true, 'thought of in the Age of Clockwork with depots standing');
});

/** A home ten tiles or so along a straight row from the first yard's door, a belt laid between the two door fronts. */
function belted(S: State) {
  const y = S.bmap.get(S.towns[0].store)!, f = front(y), H = content.blueprints.house;
  for (const dir of [1, -1]) for (let k = 8; k <= 16; k++) {
    const hx = f.x + dir * k - Math.floor(H.w / 2), hy = f.y - H.h;
    const tiles = Array.from({ length: k + 1 }, (_, j) => f.x + dir * j);
    if (placeProblem(S, 'house', hx, hy) || tiles.some(x => placeProblem(S, 'conveyor', x, f.y))) continue;
    const home = placeBuilding(S, 'house', hx, hy, true)!;
    if (front(home).y !== f.y || front(home).x !== f.x + dir * k) continue;
    for (const x of tiles) placeBuilding(S, 'conveyor', x, f.y, true);
    return { yard: y, home };
  }
  throw new Error('no straight row by the yard');
}

test('goods ride a belt from a storage yard to a home beside it, with no hands; nothing is built on a belt', () => {
  const S = createState(content, 1847, {});
  const { yard, home } = belted(S);
  assert.ok(beltBy(S, yard) >= 0 && beltBy(S, home) >= 0, 'both doors open beside the belt');
  const i = beltBy(S, home);
  assert.match(placeProblem(S, 'house', i % S.world.w, Math.floor(i / S.world.w)) ?? '', /conveyor/);
  home.inv = {};
  let landed = 0;
  runFor(S, 30, s => { if (s.stats.beltGoods > landed) landed = s.stats.beltGoods; });
  assert.ok(landed > 0, 'loads came off the belt');
  assert.ok(S.stats.beltLoads > 0 && S.stats.beltSeconds > 0);
  assert.ok((home.inv.bread || 0) + (home.inv.logs || 0) > 0, 'the home was stocked');
  // a load is counted coming as soon as it leaves, so no carrier is sent for it too
  for (const p of S.parcels) assert.ok((S.bmap.get(p.dst)!.incoming[p.item] || 0) >= p.n);
});

test('a self-planning settlement that knows the conveyor lays one along its lanes from a storage yard\'s door, and loads ride it', () => {
  const S = createState(content, 1847, { planner: true });
  learn(S, 'depot'); learn(S, 'conveyor');
  let mid: string | null = null, copy: State | null = null;
  // (kept in mind: it is not the forgetting that is tested here)
  runFor(S, 1500, s => { s.towns[0].knows.conveyor.used = s.t; if (!mid && s.parcels.length) { mid = text(s); copy = loadGame(content, mid); } });
  const t = S.towns[0];
  assert.ok(t.belts.length >= 1, 'a belt was laid');
  assert.ok(S.stats.beltTiles >= content.tuning.conveyors.minTiles);
  assert.ok(S.chronicle.some(c => c.kind === 'belt'));
  // every belt tile is a lane or a door's front, never land a building could take
  const w = S.world;
  for (let i = 0; i < w.belt.length; i++) if (w.belt[i]) assert.ok(w.road[i] > 0 || w.front[i] > 0, `belt tile ${i} on open land`);
  assert.ok(S.stats.beltGoods > 0, 'goods rode it');
  assert.equal(bestBelt(S, t) === null || bestBelt(S, t)!.serves >= content.tuning.conveyors.minStops, true);
  // saved with loads riding, it plays on exactly as before
  assert.ok(copy, 'saved with a load on the belt');
  const A = loadGame(content, mid!);
  runFor(A, 60); runFor(copy!, 60);
  assert.equal(text(A), text(copy!));
});

test('a version 26 save is upgraded to version 27: no belts laid, no loads riding, and it plays on', () => {
  const file = JSON.parse(readFileSync(new URL('./fixtures/save-v26.json', import.meta.url), 'utf8')) as SaveFile;
  assert.equal(file.version, 26);
  const S = loadGame(content, file);
  assert.equal(S.world.belts, 0);
  assert.ok(S.world.belt.every(v => v === 0));
  assert.deepEqual(S.parcels, []);
  assert.ok(S.towns.every(t => t.belts.length === 0 && t.beltT === 0));
  assert.equal(S.stats.beltGoods, 0);
  runFor(S, 60);
  assert.equal(text(loadGame(content, text(S))), text(S));
});
