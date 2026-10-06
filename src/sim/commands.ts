/**
 * The player's commands: everything the browser shell changes in the simulation goes through one of these. Each
 * takes plain data (ids, tiles, values), so a recorded list of commands, given to `command` in turn between the
 * same ticks, replays a game. The shell reads the state directly, as the renderer does, but never writes it.
 *
 * The game's own pause and speed are the shell's: they change how often it calls `tick`, not the world.
 */
import { dims, nearestTown } from './core.ts';
import { canPlace, demolish, placeBuilding, placeProblem, turnBuilding } from './buildings.ts';
import { growFarm, growProblem } from './farms.ts';
import { ZONES, type Building, type State, type Town, type ZoneKind } from './types.ts';

/** What a command did: done (with the building it placed, if any), or refused, and why in words for the player. */
export type Done = { ok: true; building?: Building } | { ok: false; why: string };

/** Turn every settlement's planner on or off (they look around at once). */
export interface PlansCommand { on: boolean }
/** Paint a zone (or, with null, clear it) with a 3 by 3 brush centred on a tile. */
export interface ZoneCommand { x: number; y: number; zone: ZoneKind | 'nobuild' | null }
/** Set one of a settlement's levers: its pace, the idea it is encouraged to think about, or a need's priority. */
export type LeverCommand = { town: number } & ({ lever: 'pace'; value: number } | { lever: 'encourage'; value: string | null } | { lever: 'priority'; need: string; value: number });
/** Set one of a settlement's laws. */
export type LawCommand = { town: number } & ({ law: 'rationing' | 'leave'; value: boolean } | { law: 'hours'; value: Town['laws']['hours'] });
/** Place a building (a construction site) with its corner at x, y, turned `rot` quarters, or lay a tile of paving or belt. */
export interface PlaceCommand { type: string; x: number; y: number; rot?: number }
/** Act on one building, by its id. */
export interface BuildingCommand { building: number }

/** Every command, tagged with what it does: what a recorded game holds. */
export type Command =
  | ({ do: 'plans' } & PlansCommand)
  | ({ do: 'zone' } & ZoneCommand)
  | ({ do: 'lever' } & LeverCommand)
  | ({ do: 'law' } & LawCommand)
  | ({ do: 'place' } & PlaceCommand)
  | ({ do: 'turn'; by?: number } & BuildingCommand)
  | ({ do: 'demolish' } & BuildingCommand)
  | ({ do: 'pause'; paused: boolean } & BuildingCommand)
  | ({ do: 'grow' } & BuildingCommand);

const ok: Done = { ok: true };
const no = (why: string): Done => ({ ok: false, why });
const building = (S: State, id: number) => { const b = S.bmap.get(id); return b && !b.dead ? b : null; };

/** The settlement whose land a building at x, y would stand on: the one the sim gives it when placed. */
export function landOf(S: State, type: string, x: number, y: number, rot = 0): Town | undefined {
  const B = S.content.blueprints[type];
  const { w, h } = B.paves ? { w: 1, h: 1 } : dims(B, rot);
  return S.towns[nearestTown(S, x + w / 2, y + h / 2)];
}

/** Why the player may not place `type` at x, y for want of knowledge, or null if the settlement there knows it. */
export function knowledgeProblem(S: State, type: string, x: number, y: number, rot = 0): string | null {
  const t = landOf(S, type, x, y, rot), B = S.content.blueprints[type];
  if (!t || !B || type in t.knows) return null;
  const others = S.towns.filter(o => type in o.knows).map(o => o.name);
  return `this is ${t.name}'s land, and ${t.name} does not know the ${B.name} yet` + (others.length ? ` (${others.join(' and ')} ${others.length > 1 ? 'do' : 'does'})` : '');
}

export function setPlans(S: State, c: PlansCommand): Done {
  for (const t of S.towns) { t.planner.on = c.on; t.planner.t = 0; }
  return ok;
}

export function paintZone(S: State, c: ZoneCommand): Done {
  const w = S.world, z = c.zone === null ? 0 : 1 + ZONES.indexOf(c.zone);
  for (let y = c.y - 1; y <= c.y + 1; y++) for (let x = c.x - 1; x <= c.x + 1; x++) if (x >= 0 && y >= 0 && x < w.w && y < w.h) w.zone[y * w.w + x] = z;
  return ok;
}

export function setLever(S: State, c: LeverCommand): Done {
  const L = S.towns[c.town]?.levers;
  if (!L) return no('there is no such settlement');
  if (c.lever === 'encourage') L.encourage = c.value;
  else if (c.lever === 'pace') L.pace = c.value;
  else L.priority[c.need] = c.value;
  return ok;
}

export function setLaw(S: State, c: LawCommand): Done {
  const L = S.towns[c.town]?.laws;
  if (!L) return no('there is no such settlement');
  if (c.law === 'hours') L.hours = c.value;
  else L[c.law] = c.value;
  return ok;
}

/**
 * Place a building or lay a tile: only where the settlement whose land it is knows it (asked first), and only on open
 * land (`placeProblem`). A building starts as a construction site; paving and belts are laid at once.
 */
export function place(S: State, c: PlaceCommand): Done {
  const rot = c.rot ?? 0;
  if (!S.content.blueprints[c.type]) return no('unknown building');
  const unknown = knowledgeProblem(S, c.type, c.x, c.y, rot);
  if (unknown) return no(unknown);
  if (!canPlace(S, c.type, c.x, c.y, rot)) return no(placeProblem(S, c.type, c.x, c.y, rot)!);
  const b = placeBuilding(S, c.type, c.x, c.y, false, rot);
  return b ? { ok: true, building: b } : ok;
}

/** Turn a building a quarter about its centre (`by` 1 clockwise, 3 back), if it fits turned. */
export function turn(S: State, c: BuildingCommand & { by?: number }): Done {
  const b = building(S, c.building);
  if (!b) return no('it is gone');
  return turnBuilding(S, b, c.by ?? 1) ? ok : no('No room to turn it there');
}

/** Pull a building down, or cancel a site. */
export function pullDown(S: State, c: BuildingCommand): Done {
  const b = building(S, c.building);
  if (!b) return no('it is gone');
  demolish(S, b);
  return ok;
}

/** Stop a workplace's work, or let it work again. */
export function pauseWork(S: State, c: BuildingCommand & { paused: boolean }): Done {
  const b = building(S, c.building);
  if (!b) return no('it is gone');
  b.paused = c.paused;
  return ok;
}

/** Lay new fields behind a farm that grows. */
export function growFields(S: State, c: BuildingCommand): Done {
  const b = building(S, c.building);
  if (!b) return no('it is gone');
  const why = growProblem(S, b);
  if (why) return no(why);
  growFarm(S, b);
  return ok;
}

/** Carry out any command: what a recorded game is replayed with. */
export function command(S: State, c: Command): Done {
  switch (c.do) {
    case 'plans': return setPlans(S, c);
    case 'zone': return paintZone(S, c);
    case 'lever': return setLever(S, c);
    case 'law': return setLaw(S, c);
    case 'place': return place(S, c);
    case 'turn': return turn(S, c);
    case 'demolish': return pullDown(S, c);
    case 'pause': return pauseWork(S, c);
    case 'grow': return growFields(S, c);
  }
}
