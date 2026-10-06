import { goToBuilding } from './agents.ts';
import { hash01 } from './rng.ts';
import { isleAt } from './sea.ts';
import { bp, chronicle, emit, villagers } from './core.ts';
import type { PathOptions } from './path.ts';
import type { Agent, Boat, Building, State, Town } from './types.ts';

/**
 * Ships (Phase 18, second pass): with ships on, boats belong to a settlement. A dock comes with one, a shipyard
 * builds more from planks, and whoever crosses the water (a visitor, a porter, an explorer) takes a free one and
 * crews it; with none free they walk, or stay ashore. A founding party bound over the water builds a boat of its
 * own from planks it takes, which stays with the daughter. See design/systems/sea.md and design/blueprints/shipyard.md.
 */
const Z = (S: State) => S.content.tuning.sea;

/** The boats of a settlement's fleet, out or moored. */
export const fleetOf = (S: State, t: Town) => S.boats.filter(b => b.town === t.id);

/** A boat moored at home, nobody aboard. */
export const freeBoat = (S: State, t: Town): Boat | undefined => S.boats.find(b => b.town === t.id && !b.crew.length);

/** The boat someone is crewing, if any. */
export const boatOf = (S: State, a: Agent): Boat | undefined => S.boats.find(b => b.crew.includes(a.id));

const hasDock = (S: State, t: Town) => S.buildings.some(b => b.town === t.id && !b.site && bp(S, b).shore);

/**
 * The boats a settlement wants: one more than it has while its people have stayed ashore for want of a free boat
 * within `boatless_memory_seconds`, else those it has (at least one); never more than one for every
 * `villagers_per_boat` people, nor `fleet_max`.
 */
export function fleetWanted(S: State, t: Town): number {
  const pop = villagers(S).filter(a => a.home?.town === t.id).length, has = fleetOf(S, t).length;
  const cap = Math.min(Z(S).fleetMax, Math.max(1, Math.ceil(pop / Z(S).villagersPerBoat)));
  return Math.min(cap, Math.max(1, has + (S.t - t.boatless <= Z(S).boatlessMemorySeconds ? 1 : 0)));
}

/** Does a settlement with a dock want another boat? */
export const wantsBoat = (S: State, t: Town | undefined) => !!t && S.ships && hasDock(S, t) && fleetOf(S, t).length < fleetWanted(S, t);

/**
 * A new boat for the settlement of `b`: a dock just built, or a shipyard's batch. Named from `boat_names` by its
 * number and the world's seed (never a random stream), a name its fleet does not already have if one is left.
 */
export function launch(S: State, b: Building, settlers = false): Boat {
  const t = S.towns[b.town], id = S.boats.length, names = Z(S).boatNames, taken = new Set(fleetOf(S, t).map(o => o.name));
  let k = Math.floor(hash01(id * 104729 + (S.seed >>> 0)) * names.length);
  for (let n = 0; n < names.length && taken.has(names[k]); n++) k = (k + 1) % names.length;
  const boat: Boat = { id, name: names[k], town: t.id, crew: [], bound: null, built: S.t, trips: 0 };
  S.boats.push(boat);
  S.stats.boatsBuilt++;
  // (settlers' own boats go into the chronicle as they land)
  const first = fleetOf(S, t).length === 1;
  if (!settlers && (bp(S, b).shipyard || first)) {
    const text = bp(S, b).shipyard ? `${t.name}'s shipyard launched the ${boat.name}` : `${t.name} has its first boat, the ${boat.name}`;
    chronicle(S, t.id, 'boat', text);
    emit(S, 'good', text, !first);
  }
  return boat;
}

/** A settlement whose people stay ashore for want of a free boat: its need for boats (`boats`). */
function ashore(S: State, t: Town) {
  if (!hasDock(S, t)) return;
  t.boatless = S.t;
  S.stats.ashore++;
}

/** Does a route cross open water? */
export const rows = (S: State, path: [number, number][]) => path.some(([x, y]) => !S.world.ground[y * S.world.w + x] && !S.world.bridge[y * S.world.w + x]);

/**
 * How someone may row, with ships on: with the boat they crew, from its settlement's docks, or from any shore once
 * they are away from its island (their boat is pulled up beside them); without one, not at all.
 */
export function rowing(S: State, a: Agent, opts?: PathOptions): PathOptions {
  const boat = boatOf(S, a);
  if (!boat) return { fleet: -1 };
  const yard = S.bmap.get(S.towns[boat.town]?.store ?? -1);
  const away = !yard || isleAt(S, Math.floor(a.x), Math.floor(a.y)) !== isleAt(S, yard.x, yard.y);
  return { fleet: boat.town, launchAnywhere: !!opts?.launchAnywhere || away };
}

/**
 * Someone sets off on a trip that may cross water (a visit, a porter's errand, a voyage); `go` finds their way.
 * With ships on, they take a free boat of their settlement's if the way rows; with none free they go only if they
 * can walk, and otherwise stay ashore, which its people remember (`boats`).
 */
export function setOff(S: State, a: Agent, t: Town, go: () => boolean): boolean {
  if (!S.ships) return go();
  const boat = freeBoat(S, t);
  if (!boat) {
    const ok = go();
    if (!ok) ashore(S, t);
    return ok;
  }
  boat.crew.push(a.id);
  const ok = go();
  if (!ok || !rows(S, a.path)) { boat.crew = boat.crew.filter(id => id !== a.id); return ok; }
  boat.trips++; S.stats.boatTrips++;
  return true;
}

/**
 * The dock a founding party bound across the water builds its boat at (with ships on): its settlement's own. Undefined
 * when the party can walk, or ships are off; null when the settlement has no dock to build one at.
 */
export function partyDock(S: State, mother: Town, site: { x: number; y: number }, foot: Uint8Array): Building | null | undefined {
  if (!S.ships || foot[(site.y + 1) * S.world.w + site.x]) return undefined;
  return S.buildings.find(b => b.town === mother.id && !b.site && bp(S, b).shore) ?? null;
}

/** The party is on its way: in the boat they built, if their ways row; else it stays moored with their old settlement's fleet. */
export function embark(S: State, boat: Boat, party: Agent[], daughter: Town) {
  if (!party.some(a => rows(S, a.path))) { boat.crew = []; return; }
  boat.crew = party.map(a => a.id);
  boat.bound = daughter.id;
  boat.trips++; S.stats.boatTrips++;
  chronicle(S, daughter.id, 'boat', `The settlers of ${daughter.name} came over the water in the ${boat.name}`);
}

/**
 * Once a second, with ships on: a boat's crew are those still on their way (on a visit, or settlers not yet on their new island);
 * once the last is home or landed, the boat is moored, with the settlement it is bound for if it carried settlers.
 */
export function updateShips(S: State) {
  if (!S.ships) return;
  for (const boat of S.boats) {
    if (!boat.crew.length) continue;
    // a visitor, porter or explorer until their visit is over
    if (boat.bound === null) { boat.crew = boat.crew.filter(id => { const a = S.amap.get(id); return !!a && !a.dead && !!a.visit; }); continue; }
    // a founding party until each of them stands on their new settlement's island; one whose way was cut short
    // (a building put up across it) sets off for it again, in the boat
    const yard = S.bmap.get(S.towns[boat.bound]?.store ?? -1), isle = yard ? isleAt(S, yard.x, yard.y) : -1;
    boat.crew = boat.crew.filter(id => {
      const a = S.amap.get(id);
      if (!a || a.dead || !yard) return false;
      if (S.world.ground[Math.floor(a.y) * S.world.w + Math.floor(a.x)] && isleAt(S, Math.floor(a.x), Math.floor(a.y)) === isle) return false;
      if (!a.path.length) goToBuilding(S, a, yard);
      return true;
    });
    if (!boat.crew.length && boat.bound !== null) { boat.town = boat.bound; boat.bound = null; }
  }
}

/** What a dock says of its settlement's fleet: boats moored and out. Words only. */
export function fleetText(S: State, t: Town | undefined): string | null {
  if (!S.ships || !t) return null;
  const fleet = fleetOf(S, t), out = fleet.filter(b => b.crew.length).length, home = fleet.length - out;
  if (!fleet.length) return 'No boat moored: a shipyard builds them';
  const names = fleet.filter(b => !b.crew.length).map(b => b.name);
  return home ? `${names.join(', ')} at the jetty${out ? `, ${out} out` : ''}` : `Every boat is out (${fleet.length})`;
}
