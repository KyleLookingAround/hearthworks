import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../src/content/node.ts';
import { bp, canPlace, command, createState, demolish, knowledgeProblem, placeBuilding, runFor, saveGame, turnBuilding, ZONES, type Command, type State } from '../src/sim/index.ts';
import { growFarm, growProblem } from '../src/sim/farms.ts';

const content = loadContent();
const NEW_GAME = { planner: true, seasons: true, trade: true, people: true, carts: true, settlers: true, charts: true, ships: true, hardship: true, plannedRoads: true, farms: true, map: 'islands', size: 'm', settlements: 2 } as const;
const text = (S: State) => JSON.stringify(saveGame(S));

/** The first open spot, scanning out from a settlement's store, where its settlement knows `type` and it fits. */
function spot(S: State, type: string, town: number, rot = 0): { x: number; y: number } {
  const st = S.bmap.get(S.towns[town].store)!;
  for (let r = 3; r < 30; r++) for (let y = st.y - r; y <= st.y + r; y++) for (let x = st.x - r; x <= st.x + r; x++)
    if (canPlace(S, type, x, y, rot) && !knowledgeProblem(S, type, x, y, rot)) return { x, y };
  throw new Error(`no spot for ${type}`);
}

test('a scripted list of commands gives the same game as making the same changes by hand', () => {
  const A = createState(content, 11, NEW_GAME), B = createState(content, 11, NEW_GAME);
  runFor(A, 240); runFor(B, 240);
  assert.equal(text(A), text(B));
  const house = spot(A, 'house', 0), path = spot(A, 'path', 1);
  const work = A.buildings.find(b => b.town === 0 && !b.site && bp(A, b).workers && !bp(A, b).grows)!;
  const farm = A.buildings.find(b => !b.site && bp(A, b).grows);
  const turnable = A.buildings.find(b => !b.site && bp(A, b).homes);
  // a site to cancel, or else a home to pull down
  const site = A.buildings.find(b => b.site && !bp(A, b).field) ?? A.buildings.find(b => !b.site && bp(A, b).homes && b !== turnable);
  assert.ok(work && turnable && site && farm, 'something to pause, turn, grow and pull down');
  // (written as JSON and read back: plain data)
  const script: Command[] = JSON.parse(JSON.stringify([
    { do: 'lever', town: 0, lever: 'pace', value: 2 },
    { do: 'lever', town: 1, lever: 'priority', need: 'planks', value: 4 },
    { do: 'lever', town: 0, lever: 'encourage', value: 'granary' },
    { do: 'law', town: 1, law: 'rationing', value: true },
    { do: 'law', town: 0, law: 'hours', value: 'long' },
    { do: 'zone', x: house.x + 6, y: house.y, zone: 'homes' },
    { do: 'zone', x: house.x + 6, y: house.y + 3, zone: 'nobuild' },
    { do: 'zone', x: house.x + 6, y: house.y + 3, zone: null },
    { do: 'place', type: 'house', x: house.x, y: house.y, rot: 0 },
    { do: 'place', type: 'path', x: path.x, y: path.y },
    { do: 'pause', building: work.id, paused: true },
    { do: 'turn', building: turnable.id },
    { do: 'grow', building: farm.id },
    { do: 'demolish', building: site.id },
    { do: 'plans', on: true },
  ] satisfies Command[]));
  const was = text(A), done = script.map(c => command(A, c));
  assert.ok(done.every((d, i) => d.ok || script[i].do === 'grow'), JSON.stringify(done));
  assert.notEqual(text(A), was, 'the commands changed the world');

  // the same by hand
  const t0 = B.towns[0], t1 = B.towns[1], W = B.world;
  t0.levers.pace = 2; t1.levers.priority.planks = 4; t0.levers.encourage = 'granary';
  t1.laws.rationing = true; t0.laws.hours = 'long';
  const brush = (cx: number, cy: number, z: number) => { for (let y = cy - 1; y <= cy + 1; y++) for (let x = cx - 1; x <= cx + 1; x++) W.zone[y * W.w + x] = z; };
  brush(house.x + 6, house.y, 1 + ZONES.indexOf('homes')); brush(house.x + 6, house.y + 3, 1 + ZONES.indexOf('nobuild')); brush(house.x + 6, house.y + 3, 0);
  placeBuilding(B, 'house', house.x, house.y, false, 0);
  placeBuilding(B, 'path', path.x, path.y, true);
  B.bmap.get(work.id)!.paused = true;
  turnBuilding(B, B.bmap.get(turnable.id)!);
  const f = B.bmap.get(farm.id)!;
  if (!growProblem(B, f)) growFarm(B, f);
  demolish(B, B.bmap.get(site.id)!);
  for (const t of B.towns) { t.planner.on = true; t.planner.t = 0; }

  assert.equal(text(A), text(B), 'the same world straight after');
  runFor(A, 240); runFor(B, 240);
  assert.equal(text(A), text(B), 'and four minutes on');
});

test('commands refuse what the player may not do, in words, and change nothing', () => {
  const S = createState(content, 11, NEW_GAME);
  runFor(S, 60);
  const before = text(S), st = S.bmap.get(S.towns[0].store)!;
  const unknown = Object.values(content.blueprints).find(B => !B.paves && !(B.id in S.towns[0].knows) && !S.towns.some(t => B.id in t.knows))!;
  const here = { x: st.x + 4, y: st.y + 4 };
  const r1 = command(S, { do: 'place', type: unknown.id, ...here });
  assert.equal(r1.ok, false);
  assert.match((r1 as { why: string }).why, /does not know the/);
  const r2 = command(S, { do: 'place', type: 'house', x: st.x, y: st.y });
  assert.deepEqual(r2, { ok: false, why: 'something is already built there' });
  assert.deepEqual(command(S, { do: 'pause', building: 1e9, paused: true }), { ok: false, why: 'it is gone' });
  assert.deepEqual(command(S, { do: 'law', town: 99, law: 'leave', value: false }), { ok: false, why: 'there is no such settlement' });
  assert.equal(text(S), before);
});
