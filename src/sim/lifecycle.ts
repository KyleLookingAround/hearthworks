import { release, removeAgent } from './agents.ts';
import { cancelTask, touches } from './logistics.ts';
import { emit } from './core.ts';
import { setOff } from './ships.ts';
import type { Agent, Building, GameEvent, State, Town, Visit } from './types.ts';

/*
 * The comings and goings every system shares, each written once: a villager moving to another home, a villager
 * lost (leaving or dying), someone sent on a trip that may cross water, and a building turned back into a site.
 */

/** A villager moves into another home (or, with `home` null, has none): out of the old one's beds, into the new one's. */
export function moveHome(a: Agent, home: Building | null) {
  if (a.home) a.home.residents = a.home.residents.filter(id => id !== a.id);
  a.home = home;
  if (home) home.residents.push(a.id);
}

/** Why a villager is lost: who died (and of what), and who left (and why). */
export type Loss = 'starved' | 'sickness' | 'old age' | 'hunger' | 'demolition';
const DIED: Record<Loss, boolean> = { starved: true, sickness: true, 'old age': true, hunger: false, demolition: false };

/**
 * A villager is lost to their settlement: gone from the world, counted (deaths or departures, and by cause), and,
 * with people on, a death leaves a rite owed in the settlement they lived in. `say` gives the news, if any, from the
 * settlement they lived in (undefined if they had no home): its kind, words and whether it is minor.
 */
export function loseVillager(S: State, a: Agent, cause: Loss, say?: (town: Town | undefined) => [GameEvent['kind'], string, boolean?] | null) {
  const town = a.home ? S.towns[a.home.town] : undefined;
  removeAgent(S, a);
  if (DIED[cause]) {
    S.stats.deaths++;
    if (cause === 'starved') S.stats.starved++;
    else if (cause === 'sickness') S.stats.sickDeaths++;
    if (S.people && town) town.rites.push(S.t);
  } else {
    S.stats.departures++;
    if (cause === 'demolition') S.stats.demolitionDepartures++;
  }
  const news = say?.(town);
  if (news) emit(S, news[0], news[1], news[2]);
}

/**
 * A carrier free to go on a trip from among a settlement's people: someone carrying (and not away already) who passes
 * `ok`, with empty hands and idle, wandering or on the way to fetch something; never the last carrier. Null if none.
 */
export function traveller(people: Agent[], ok: (a: Agent) => boolean = () => true): Agent | null {
  const carriers = people.filter(a => a.role === 'carrier' && a.state !== 'visit' && ok(a));
  if (carriers.length < 2) return null;
  return carriers.find(c => !c.carry && (c.state === 'idle' || c.state === 'wander' || c.state === 'toSrc')) ?? null;
}

/**
 * Someone sets off on a trip (a visit, a porter's errand with a load, an explorer's voyage): they drop the job they
 * had (the goods stay where they were), take up `visit`, and set off as `go` finds their way, in a boat of their
 * settlement's where the way rows (`setOff`). A visitor or porter whose way crosses water has a boat to row home in;
 * an explorer always has. Returns false, the trip called off and they idle again, when they cannot set off.
 */
export function sendOnTrip(S: State, a: Agent, town: Town, visit: Visit, go: () => boolean, load?: Agent['carry']): boolean {
  cancelTask(a);
  a.visit = visit;
  if (load) a.carry = load;
  a.state = 'visit';
  if (!setOff(S, a, town, go)) {
    a.visit = null; if (load) a.carry = null; a.state = 'idle';
    return false;
  }
  if (!visit.explore) visit.boat = a.path.some(([x, y]) => S.world.ground[y * S.world.w + x] === 0);
  return true;
}

/**
 * A building turned back into a construction site that needs `share` of its cost to stand again: nobody fetches from
 * or brings to it, its workers go back to carrying, a depot's bots are gone (rebuilt, it winds up new ones), and what it
 * held is lost but for the rest of its cost, which stands delivered.
 */
export function toSite(S: State, b: Building, share: number) {
  const B = S.content.blueprints[b.type];
  for (const a of S.agents) if (touches(a, b)) cancelTask(a);
  release(S, b);
  for (const id of b.bots) { const bot = S.amap.get(id); if (bot) removeAgent(S, bot); }
  b.bots = [];
  b.site = true; b.build = 0; b.incoming = {}; b.reserved = {}; b.waiting = {}; b.timer = 0; b.used = 0;
  b.inv = {};
  for (const k in B.cost) { const left = Math.floor(B.cost[k] * (1 - share)); if (left > 0) b.inv[k] = left; }
}
