import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadContent } from '../src/content/node.ts';
import { createState, loadGame, placeBuilding, pressure, runFor, saveGame, type SaveFile, type State } from '../src/sim/index.ts';
import { goToBuilding, makeAgent } from '../src/sim/agents.ts';
import { chooseSpot } from '../src/sim/planner.ts';
import { enoughInStore } from '../src/sim/production.ts';
import { fleetOf, freeBoat, rows, setOff, wantsBoat } from '../src/sim/ships.ts';

const content = loadContent();
const text = (S: State) => JSON.stringify(saveGame(S));

/** Two settlements on islands of their own, ships on, and a dock built for the first. */
function harbour(ships = true) {
  const S = createState(content, 1847, { ships, trade: true, settlements: 2, map: 'islands', size: 'm' });
  const home = S.towns[0], spot = chooseSpot(S, 'dock', home)!;
  const dock = placeBuilding(S, 'dock', spot.x, spot.y, true, spot.rot)!;
  dock.town = home.id;
  return { S, home, there: S.towns[1], dock };
}

/** A traveller from the first settlement's yard, set off for the second's. */
function traveller(S: State) {
  const yard = S.bmap.get(S.towns[0].store)!, a = makeAgent(S, 'villager', yard.x + 0.5, yard.y + 2.5);
  a.home = yard;
  a.visit = { from: 0, to: 1, back: false, carry: {}, boat: false };
  a.state = 'visit';
  return { a, go: () => setOff(S, a, S.towns[0], () => goToBuilding(S, a, S.bmap.get(S.towns[1].store)!)) };
}

test('with ships on, a dock comes with a named boat, and a crossing takes it: with none free, the next traveller stays ashore', () => {
  const { S, home } = harbour();
  const fleet = fleetOf(S, home);
  assert.equal(fleet.length, content.tuning.sea.dockBoats);
  assert.ok(content.tuning.sea.boatNames.includes(fleet[0].name));
  assert.ok(S.chronicle.some(c => c.kind === 'boat' && c.text.includes(fleet[0].name)), 'the first boat goes into the chronicle');
  const one = traveller(S);
  assert.ok(one.go(), 'the first rows over');
  assert.ok(rows(S, one.a.path));
  assert.deepEqual(fleet[0].crew, [one.a.id], 'and crews the boat');
  assert.equal(freeBoat(S, home), undefined);
  // the second has no boat, so no way across, and the settlement remembers it
  assert.equal(pressure(S, home, 'boats'), 0);
  const two = traveller(S);
  assert.equal(two.go(), false);
  assert.equal(S.stats.ashore, 1);
  assert.equal(pressure(S, home, 'boats'), 1);
  // once the first is home from their visit, the boat is moored again
  one.a.visit = null; one.a.state = 'idle';
  runFor(S, 2);
  assert.deepEqual(fleet[0].crew, []);
  assert.ok(two.go(), 'and the next can take it');
});

test('without ships, anyone rows from any dock, as before', () => {
  const { S } = harbour(false);
  assert.equal(S.boats.length, 0);
  const one = traveller(S), two = traveller(S);
  assert.ok(one.go() && two.go());
  assert.ok(rows(S, one.a.path) && rows(S, two.a.path));
});

test('a shipyard builds a boat from planks while the fleet wants one, then rests', () => {
  const { S, home, dock } = harbour();
  S.boats.length = 0;
  assert.ok(wantsBoat(S, home));
  const yard = S.bmap.get(home.store)!;
  // a shipyard beside the yard, stocked, and a villager to work it
  let ship = null;
  for (let r = 3; !ship && r < 20; r++) for (const [dx, dy] of [[r, 0], [-r, 0], [0, r], [0, -r]]) if (!ship) ship = placeBuilding(S, 'shipyard', yard.x + dx, yard.y + dy, true);
  assert.ok(ship, 'room for a shipyard');
  ship!.town = home.id;
  ship!.inv.planks = 12;
  assert.equal(enoughInStore(S, ship!), false, 'it works while the fleet wants a boat');
  runFor(S, content.blueprints.shipyard.seconds * 2 + 30);
  assert.equal(fleetOf(S, home).length, 1, 'one boat, as the fleet wants for a small settlement');
  assert.ok(S.chronicle.some(c => c.kind === 'boat' && c.text.includes('shipyard launched')));
  assert.equal(enoughInStore(S, ship!), true, 'then it rests');
  assert.ok(!dock.dead);
});

test('a settlement whose island is full founds a colony whose settlers build a boat of their own, which stays with the colony', () => {
  const S = createState(content, 1847, { planner: true, settlers: true, trade: true, ships: true, map: 'islands', size: 'm' });
  runFor(S, 2700);
  const colony = S.towns.find(t => t.overseas);
  assert.ok(colony, 'a colony across the water');
  assert.ok(S.chronicle.some(c => c.kind === 'boat' && c.town === colony!.id && c.text.includes('came over the water')));
  assert.ok(S.boats.some(b => b.town === colony!.id), 'the boat they came in is the colony\'s');
  assert.ok(S.boats.some(b => b.town === colony!.mother), 'and the mother keeps its own');
  assert.ok(S.stats.boatTrips > 0);
});

test('a game with a boat out saves and loads, and plays on as if it had never stopped', () => {
  const { S } = harbour();
  const one = traveller(S);
  assert.ok(one.go());
  const L = loadGame(content, text(S));
  assert.ok(L.ships && L.boats.length === S.boats.length && L.boats[0].crew[0] === one.a.id);
  runFor(S, 60); runFor(L, 60);
  assert.equal(text(L), text(S));
});

test('a version 28 save is upgraded to version 29: ships are off, no boats, and it plays on, rowing as before', () => {
  const file = JSON.parse(readFileSync(new URL('./fixtures/save-v28.json', import.meta.url), 'utf8')) as SaveFile;
  assert.equal(file.version, 28);
  const S = loadGame(content, file);
  assert.ok(S.world.docks > 0, 'the fixture has docks, so people row');
  assert.equal(S.ships, false);
  assert.deepEqual(S.boats, []);
  assert.ok(S.towns.every(t => t.boatless < 0));
  assert.equal(S.stats.boatTrips, 0);
  runFor(S, 60);
  assert.equal(text(loadGame(content, text(S))), text(S));
});
