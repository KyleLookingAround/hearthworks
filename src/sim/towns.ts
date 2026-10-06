import { makeRng } from './rng.ts';
import { makeAgent } from './agents.ts';
import { moveHome } from './lifecycle.ts';
import { chronicle, villagers } from './core.ts';
import { firstSite, generateWorld, neighbourSite, prepareSite } from './worldgen.ts';
import { placeBuilding } from './buildings.ts';
import { foundersKnowledge } from './knowledge.ts';
import { initPeople } from './people.ts';
import { offered } from './farms.ts';
import { newLedger } from './trade.ts';
import type { Agent, Content, PlannerState, State, Town } from './types.ts';

export const plannerOn = (on: boolean): PlannerState => ({ on, t: 0, settle: 0, streak: { type: '', n: 0 }, site: null, want: null, saving: null, status: on ? 'Looking around the village' : 'Village plans are off', placed: 0, noRoom: {}, roads: true, replanAt: 0, renewAt: 0, firstFor: {}, wants: {}, use: {} });

/**
 * A new island with the starting settlement at its centre: a storage yard, two houses and a short road.
 * `settlements` above 1 founds neighbours the same way, as far apart as the land allows.
 * The village planner is off unless `planner` is set, so scripted scenarios stay scripted.
 */
export interface WorldOptions { /** the year turns (default off, for scenarios that predate seasons) */ seasons?: boolean; /** neighbours trade (default off, for scenarios that predate it) */ trade?: boolean; /** villagers age, are born and die, learn, and honour their dead (default off) */ people?: boolean; /** cart sheds and handcarts (default off) */ carts?: boolean; /** crowded settlements found daughter towns (default off) */ settlers?: boolean; /** settlements know only the islands they have charted, and send explorers (default off) */ charts?: boolean; /** fire, flood, sickness and barbarians (default off) */ hardship?: boolean; /** settlements think of roads and lay them in straight strips (default off) */ plannedRoads?: boolean; /** newcomers arrive (default on) */ newcomers?: boolean; /** farms grow fields and hands, and homes eat a varied diet (default off) */ farms?: boolean; /** boats belong to settlements, one with each dock and more from shipyards (default off) */ ships?: boolean; /** planners pave worn paths (default on) */ roads?: boolean; planner?: boolean; settlements?: number; map?: string; size?: string }

export function createState(content: Content, seed: number, opts: WorldOptions = {}): State {
  const S = {
    content, seed, rng: makeRng(seed), krng: makeRng(seed ^ 0x6b6e6f77), t: 0, buildings: [], agents: [], bmap: new Map(), amap: new Map(), nextId: 1,
    mood: 1, fed: 1, migT: 0, secT: 0, events: [], towns: [], chronicle: [], seasons: false, trade: false,
    stats: { made: {}, trades: 0, births: 0, deaths: 0, honoured: 0, riteWaitMax: 0, feasts: 0, feastsMissed: 0, cartDeliveries: 0, goodsDelivered: 0, longGoods: 0, longGoodsByCart: 0, longFootSeconds: 0, longCartSeconds: 0, longDeliveries: 0, longByCart: 0, oxTrips: 0, longGoodsByOx: 0, longOxSeconds: 0, deliverySeconds: 0, delivered: 0, deliveryTiles: 0, replanned: 0, pulledDown: 0, movedOut: 0, demolitionDepartures: 0, spoiled: 0, deliveries: { villager: 0, bot: 0 }, arrivals: 0, departures: 0, peakVillagers: 0, eaten: {}, grown: 0, invented: 0, taught: 0, forgotten: 0, fires: 0, burnt: 0, floods: 0, outbreaks: 0, raids: 0, repelled: 0, looted: 0, sickDeaths: 0, starved: 0, camps: 0, gifts: 0, campsSettled: 0, barbariansSettled: 0, voyages: 0, charted: 0, roadsLaid: 0, roadTiles: 0, roadCut: 0, roadMoved: 0, roadDeliveries: 0, roadDeliverySeconds: 0, roadDeliveryTiles: 0, pathDeliveries: 0, pathDeliverySeconds: 0, pathDeliveryTiles: 0, beltsLaid: 0, beltTiles: 0, beltLoads: 0, beltGoods: 0, beltSeconds: 0, boatsBuilt: 0, boatTrips: 0, ashore: 0, ways: {}, handedOn: 0, handedOnBelt: 0 },
    parcels: [], boats: [],
  } as unknown as State;
  const mt = content.tuning.map;
  const mapId = opts.map ?? mt.standardType, sizeId = opts.size ?? mt.standardSize;
  const M = content.maps[mapId], size = mt.sizes[sizeId];
  if (!M) throw new Error(`unknown map type "${mapId}"`);
  if (!size) throw new Error(`unknown map size "${sizeId}"`);
  if (M.sizes && !M.sizes.includes(sizeId)) throw new Error(`${M.name} is not offered at size "${sizeId}"`);
  S.setup = { map: mapId, size: sizeId, settlements: opts.settlements ?? 1 };
  S.seasons = opts.seasons ?? false;
  S.trade = opts.trade ?? false;
  S.people = opts.people ?? false;
  S.carts = opts.carts ?? false;
  S.settlers = opts.settlers ?? false;
  S.charts = opts.charts ?? false;
  S.newcomers = opts.newcomers ?? true;
  S.prng = makeRng(seed ^ 0x70656f70);
  S.hardship = opts.hardship ?? false;
  S.plannedRoads = opts.plannedRoads ?? false;
  S.farms = opts.farms ?? false;
  S.ships = opts.ships ?? false;
  S.hrng = makeRng(seed ^ 0x68617264);
  S.camps = []; S.campT = 0;
  S.world = generateWorld(M, size.width, size.height, S);
  const L = content.tuning.logistics;
  S.world.waterCost = L.villagerSpeed / L.boatSpeed; S.world.shallowCost = 1 / content.tuning.sea.shallowSpeed;
  S.world.slopeCost = L.slopeCost; S.world.rockCost = L.rockCost;
  S.world.pathCost = 1 / L.pathSpeed; S.world.roadCost = 1 / L.roadSpeed; S.world.stoneCost = 1 / L.stoneRoadSpeed; S.world.forestCost = 1 / L.forestSpeed;
  const first = firstSite(S);
  prepareSite(S, M, first.x, first.y);
  foundTown(S, first.x, first.y, opts.planner ?? false, opts.roads ?? true);
  for (let k = 1; k < (opts.settlements ?? 1); k++) {
    const at = neighbourSite(S);
    if (!at) break;
    prepareSite(S, M, at.x, at.y);
    foundTown(S, at.x, at.y, opts.planner ?? false, opts.roads ?? true);
  }
  S.planner = S.towns[0].planner;
  if (S.people) initPeople(S);
  S.stats.peakVillagers = villagers(S).length;
  return S;
}

/** Lay out a settlement around (cx, cy): storage, a house either side, a road and the starting villagers. */
export function foundTown(S: State, cx: number, cy: number, planner: boolean, roads: boolean, party?: Agent[]): Town {
  const content = S.content, t = content.tuning.start, W = S.world.w;
  const id = S.towns.length;
  const store = placeBuilding(S, 'storage', cx - 1, cy - 1, true)!;
  store.inv = { ...t.storage };
  const town: Town = { id, name: t.names[id % t.names.length], store: store.id, knows: foundersKnowledge(content, B => offered(S, B)), planner: { ...plannerOn(planner), roads }, haul: 0, cut: 0, fed: 1, mood: 1, visitT: 0, detour: 0, detours: [], districts: [store.id], streets: [], levers: { priority: {}, encourage: null, pace: 1 }, form: 'hamlet', trade: newLedger(), custom: 'burial', naming: 'fields', craft: null, why: {}, rites: [], feasts: [], feastUntil: -1e9, graves: {}, copyT: 0, reach: 0, mother: null, overseas: false, age: 0, laws: { rationing: false, hours: 'normal', leave: true }, struck: {}, roadT: 0, roads: [], beltT: 0, belts: [], sentAt: -1e9, settleT: 0, charted: [], lookT: 1e9, explore: false, voyageAt: -1e9, boatless: -1e9, ways: {}, advice: [], advised: {} };
  S.towns.push(town);
  if (!party) chronicle(S, id, 'founded', `${town.name} was founded with ${t.villagers} villagers`);
  const h1 = placeBuilding(S, 'house', cx - 5, cy - 1, true)!, h2 = placeBuilding(S, 'house', cx + 3, cy - 1, true)!;
  for (const b of [store, h1, h2]) b.town = id;
  h1.inv = { ...t.houseStock }; h2.inv = { ...t.houseStock };
  for (let x = cx - 5; x <= cx + 4; x++) if (S.world.ground[(cy + 2) * W + x] && S.world.road[(cy + 2) * W + x] < 2) { S.world.road[(cy + 2) * W + x] = 1; S.world.tree[(cy + 2) * W + x] = 0; }
  const homes = [h1, h2], cap = content.blueprints.house.homes;
  // a founding party moves in rather than new villagers
  if (party) {
    for (const a of party) {
      const home = homes.find(h => h.residents.length < cap);
      moveHome(a, home ?? null);
    }
    return town;
  }
  for (let k = 0; k < t.villagers; k++) {
    const home = homes.find(h => h.residents.length < cap);
    const a = makeAgent(S, 'villager', cx - 1.5 + (k % 5), cy + 2.5);
    if (home) { a.home = home; home.residents.push(a.id); }
  }
  return town;
}
