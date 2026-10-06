/**
 * Builds game content from the design bundle. Blueprints, goods and tuning
 * numbers are read from the same OKF concept documents people and agents
 * edit, so the design docs cannot drift from the running game.
 */
import { parseDoc, type Doc } from './frontmatter.ts';
import type { YamlMap, YamlValue } from './yaml.ts';
import type { BlueprintDef, Content, Hazard, EraDef, GoodDef, MapDef, MapSize, Naming, Stock, Tuning } from '../sim/types.ts';

export interface SourceFile { path: string; raw: string }

export class ContentError extends Error {
  problems: string[];
  constructor(problems: string[]) {
    super(`Design bundle has ${problems.length} problem(s):\n- ${problems.join('\n- ')}`);
    this.problems = problems;
  }
}

/** FNV-1a, 32 bit, as hex. Enough to tell two content builds apart. */
export function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).padStart(8, '0');
}

const isMap = (v: YamlValue | undefined): v is YamlMap => !!v && typeof v === 'object' && !Array.isArray(v);
/** Pressures a village can struggle with, and so invent its way out of. */
const NEEDS = ['bread', 'hauling', 'crossing', 'detours', 'forgetting', 'inquiry', 'distance', 'long_hauls', 'traffic', 'conveying', 'boats', 'reading', 'fire', 'flood', 'sickness', 'raids'];
const HAZARDS = ['fire', 'flood', 'sickness', 'raids'];
const slug = (path: string) => path.replace(/^.*\//, '').replace(/\.md$/, '');

export function buildContent(files: SourceFile[]): Content {
  const problems: string[] = [];
  const docs: Doc[] = [];
  for (const f of [...files].sort((a, b) => a.path.localeCompare(b.path))) {
    if (/(^|\/)(index|log)\.md$/.test(f.path)) continue;
    try { docs.push(parseDoc(f.path, f.raw)); } catch (e) { problems.push((e as Error).message); }
  }
  const hash = fnv1a(files.map(f => f.path + '\n' + f.raw).sort().join('\n'));

  const num = (d: Doc, v: YamlValue | undefined, key: string, def?: number): number => {
    if (v === undefined || v === null) {
      if (def !== undefined) return def;
      problems.push(`${d.path}: "${key}" is required`); return 0;
    }
    if (typeof v !== 'number' || !Number.isFinite(v)) { problems.push(`${d.path}: "${key}" must be a number`); return 0; }
    return v;
  };
  const str = (d: Doc, v: YamlValue | undefined, key: string, def?: string): string => {
    if (v === undefined || v === null) {
      if (def !== undefined) return def;
      problems.push(`${d.path}: "${key}" is required`); return '';
    }
    return String(v);
  };
  const stock = (d: Doc, v: YamlValue | undefined, key: string): Stock => {
    if (v === undefined || v === null) return {};
    if (!isMap(v)) { problems.push(`${d.path}: "${key}" must be a mapping like { plank: 6 }`); return {}; }
    const out: Stock = {};
    for (const k in v) out[k] = num(d, v[k], `${key}.${k}`);
    return out;
  };

  // goods
  const goods: Record<string, GoodDef> = {};
  for (const d of docs.filter(d => d.path.startsWith('goods/'))) {
    if (d.data.type !== 'Good') continue;
    const id = slug(d.path);
    goods[id] = { id, name: str(d, d.data.title, 'title'), color: str(d, d.data.color, 'color'), description: str(d, d.data.description, 'description', ''), order: num(d, d.data.order, 'order', 99), spoils: num(d, d.data.spoils, 'spoils', 0) };
  }
  const checkGoods = (d: Doc, s: Stock, key: string) => { for (const k in s) if (!goods[k]) problems.push(`${d.path}: ${key} names "${k}", which has no goods/${k}.md`); };

  // blueprints
  const blueprints: Record<string, BlueprintDef> = {};
  for (const d of docs.filter(d => d.path.startsWith('blueprints/'))) {
    if (d.data.type !== 'Blueprint') continue;
    const id = slug(d.path), f = d.data;
    const size = Array.isArray(f.size) ? f.size : [1, 1];
    const recipe = isMap(f.recipe) ? f.recipe : {};
    const harvest = isMap(f.harvest) ? f.harvest : null;
    const couriers = isMap(f.couriers) ? f.couriers : null;
    const nuisance = isMap(f.nuisance) ? f.nuisance : null;
    const bridge = isMap(f.bridge) ? f.bridge : null;
    const discovery = isMap(f.discovery) ? f.discovery : null;
    const guards = isMap(f.guards) ? f.guards : null;
    const bp: BlueprintDef = {
      id,
      name: str(d, f.title, 'title'),
      description: str(d, f.description, 'description', ''),
      color: str(d, f.color, 'color', '#8a7a62'),
      order: num(d, f.order, 'order', 99),
      w: num(d, size[0], 'size[0]'), h: num(d, size[1], 'size[1]'),
      cost: stock(d, f.cost, 'cost'),
      workers: num(d, f.workers, 'workers', 0),
      input: stock(d, recipe.input, 'recipe.input'),
      output: stock(d, recipe.output, 'recipe.output'),
      seconds: num(d, recipe.seconds, 'recipe.seconds', 0),
      keepStocked: stock(d, f.keep_stocked, 'keep_stocked'),
      homes: num(d, f.homes, 'homes', 0),
      harvest: harvest ? { radius: num(d, harvest.radius, 'harvest.radius'), replant: harvest.replant === true } : null,
      couriers: couriers ? { count: num(d, couriers.count, 'couriers.count'), radius: num(d, couriers.radius, 'couriers.radius') } : null,
      storage: f.storage === true,
      capacity: num(d, f.capacity, 'capacity', 0),
      keeps: Array.isArray(f.keeps) ? f.keeps.map(String) : null,
      deposit: isMap(f.deposit) ? { kind: str(d, f.deposit.kind, 'deposit.kind'), radius: num(d, f.deposit.radius, 'deposit.radius') } : null,
      tools: isMap(f.tools) ? { speedup: num(d, f.tools.speedup, 'tools.speedup'), wearCycles: num(d, f.tools.wear_cycles, 'tools.wear_cycles') } : null,
      paves: f.paves === true,
      road: f.road === true,
      stone: f.stone === true,
      belt: f.belt === true,
      shore: f.shore === true,
      zone: f.zone === 'farms' || f.zone === 'workshops' || f.zone === 'homes' ? f.zone : (num(d, f.homes, 'homes', 0) > 0 ? 'homes' : null),
      seasonal: f.seasonal === true,
      rite: f.rite === 'burial' || f.rite === 'cremation' || f.rite === 'ship' ? f.rite : null,
      graves: typeof f.graves === 'number' ? f.graves : 0,
      carts: typeof f.carts === 'number' ? f.carts : 0,
      oxen: typeof f.oxen === 'number' ? f.oxen : 0,
      learning: f.learning === 'library' || f.learning === 'school' || f.learning === 'university' || f.learning === 'press' ? f.learning : null,
      hall: f.hall === true,
      form: f.form === 'town' ? 'town' : f.form === 'village' ? 'village' : 'hamlet',
      bridge: bridge ? { maxSpan: num(d, bridge.max_span, 'bridge.max_span') } : null,
      nuisance: nuisance ? { radius: num(d, nuisance.radius, 'nuisance.radius'), amount: num(d, nuisance.amount, 'nuisance.amount') } : null,
      sanitation: isMap(f.sanitation) ? { radius: num(d, f.sanitation.radius, 'sanitation.radius') } : null,
      mills: isMap(f.mills) ? { types: Array.isArray(f.mills.types) ? f.mills.types.map(String) : [], radius: num(d, f.mills.radius, 'mills.radius'), factor: num(d, f.mills.factor, 'mills.factor'), boon: str(d, f.mills.boon, 'mills.boon') } : null,
      guards: guards ? { hazard: str(d, guards.hazard, 'guards.hazard') as Hazard, radius: num(d, guards.radius, 'guards.radius'), defence: num(d, guards.defence, 'guards.defence', 0) } : null,
      discovery: discovery ? { need: str(d, discovery.need, 'discovery.need'), meanSeconds: num(d, discovery.mean_seconds, 'discovery.mean_seconds'), after: Array.isArray(discovery.after) ? discovery.after.map(String) : [], university: discovery.university === true } : null,
      grows: isMap(f.grows) ? { names: Array.isArray(f.grows.names) ? f.grows.names.map(String) : [] } : null,
      field: f.field === true,
      option: f.option === 'farms' || f.option === 'ships' ? f.option : null,
      shipyard: f.shipyard === true,
      ripens: num(d, f.ripens, 'ripens', 0),
    };
    if (bp.belt && !bp.paves) problems.push(`${d.path}: a belt is laid tile by tile: it needs paves: true`);
    if (bp.grows && bp.grows.names.length < 2) problems.push(`${d.path}: grows.names must name at least two sizes`);
    if (f.option !== undefined && f.option !== 'farms' && f.option !== 'ships') problems.push(`${d.path}: option "${String(f.option)}" is not farms or ships`);
    if (bp.shipyard && (bp.seconds <= 0 || !bp.workers)) problems.push(`${d.path}: a shipyard needs workers and recipe.seconds above 0`);
    if (bp.discovery && !NEEDS.includes(bp.discovery.need)) problems.push(`${d.path}: discovery.need "${bp.discovery.need}" is not one of ${NEEDS.join(', ')}`);
    if (bp.guards && !HAZARDS.includes(bp.guards.hazard)) problems.push(`${d.path}: guards.hazard "${bp.guards.hazard}" is not one of ${HAZARDS.join(', ')}`);
    if (Object.keys(bp.output).length && bp.seconds <= 0) problems.push(`${d.path}: recipe.seconds must be above 0 when there is an output`);
    if (Object.keys(bp.output).length && !bp.workers) problems.push(`${d.path}: a recipe needs workers: 1`);
    checkGoods(d, bp.cost, 'cost'); checkGoods(d, bp.input, 'recipe.input'); checkGoods(d, bp.output, 'recipe.output'); checkGoods(d, bp.keepStocked, 'keep_stocked');
    blueprints[id] = bp;
  }
  for (const need of ['storage', 'house']) if (!blueprints[need]) problems.push(`blueprints/${need}.md is required: the starting settlement uses it`);

  // map types
  const maps: Record<string, MapDef> = {};
  // eras: discoveries grouped into ages
  const eras: EraDef[] = [];
  for (const d of docs.filter(d => d.path.startsWith('eras/'))) {
    if (d.data.type !== 'Era') continue;
    const f = d.data, list = Array.isArray(f.discoveries) ? f.discoveries.map(String) : [], unlocks = Array.isArray(f.unlocks) ? f.unlocks.map(String) : [];
    eras.push({ id: slug(d.path), name: String(f.title ?? slug(d.path)).replace(/^The Age of /, ''), order: num(d, f.order, 'order'), discoveries: list, share: num(d, f.share, 'share'), unlocks });
  }
  eras.sort((a, b) => a.order - b.order);
  for (const d of docs.filter(d => d.path.startsWith('maps/'))) {
    if (d.data.type !== 'Map Type') continue;
    const id = slug(d.path), f = d.data;
    const part = (key: string): YamlMap => (isMap(f[key]) ? f[key] as YamlMap : (problems.push(`${d.path}: "${key}" must be a mapping`), {}));
    const t = part('terrain'), sh = part('shores'), st = part('start'), fo = part('forest');
    const shape = str(d, f.shape, 'shape');
    if (!['island', 'islands', 'landmass', 'coast'].includes(shape)) problems.push(`${d.path}: shape "${shape}" is not island, islands, landmass or coast`);
    const isl = isMap(f.islands) ? f.islands : null, riv = isMap(f.rivers) ? f.rivers : {};
    maps[id] = {
      id, name: str(d, f.title, 'title'), description: str(d, f.description, 'description', ''), order: num(d, f.order, 'order', 99),
      shape: shape as MapDef['shape'], coastline: num(d, f.coastline, 'coastline', 0.6),
      islands: isl ? { countMin: num(d, isl.count_min, 'islands.count_min'), countMax: num(d, isl.count_max, 'islands.count_max'), radiusMin: num(d, isl.radius_min, 'islands.radius_min'), radiusMax: num(d, isl.radius_max, 'islands.radius_max'), minTiles: num(d, isl.min_tiles, 'islands.min_tiles', 0), scaleTiles: num(d, isl.scale_tiles, 'islands.scale_tiles', 1e9), countCap: num(d, isl.count_cap, 'islands.count_cap', 1) } : null,
      islets: num(d, f.islets, 'islets', 0),
      rivers: { count: num(d, riv.count, 'rivers.count', 0), width: num(d, riv.width, 'rivers.width', 2) },
      neighbours: f.neighbours === 'anywhere' ? 'anywhere' : 'reachable',
      sizes: Array.isArray(f.sizes) ? f.sizes.map(String) : null,
      mountains: isMap(f.mountains) ? { level: num(d, f.mountains.level, 'mountains.level') } : null,
      deposits: (() => { const dp = isMap(f.deposits) ? f.deposits : {}; return { fertile: num(d, dp.fertile, 'deposits.fertile', 0.2), stone: num(d, dp.stone, 'deposits.stone', 0.05), clay: num(d, dp.clay, 'deposits.clay', 0.3), fish: num(d, dp.fish, 'deposits.fish', 0.25), iron: num(d, dp.iron, 'deposits.iron', 0.04) }; })(),
      terrain: { largeCell: num(d, t.large_cell, 'terrain.large_cell'), smallCell: num(d, t.small_cell, 'terrain.small_cell'), large: num(d, t.large, 'terrain.large'), small: num(d, t.small, 'terrain.small'), base: num(d, t.base, 'terrain.base'), falloff: num(d, t.falloff, 'terrain.falloff') },
      shores: { grass: num(d, sh.grass, 'shores.grass'), sand: num(d, sh.sand, 'shores.sand'), seaBorder: sh.sea_border === true },
      start: { landRadius: num(d, st.land_radius, 'start.land_radius'), clearRadius: num(d, st.clear_radius, 'start.clear_radius') },
      forest: { cell: num(d, fo.cell, 'forest.cell'), threshold: num(d, fo.threshold, 'forest.threshold'), density: num(d, fo.density, 'forest.density'), scatter: num(d, fo.scatter, 'forest.scatter'), groveDensity: num(d, fo.grove_density, 'forest.grove_density') },
      sea: isMap(f.sea) ? { reefs: num(d, f.sea.reefs, 'sea.reefs') } : null,
    };
  }

  // tuning, one block per system doc: each key of the Tuning interface read from its snake_case name in the YAML
  const sys = (name: string): [Doc, YamlMap] => {
    const d = docs.find(x => x.path === `systems/${name}.md`);
    if (!d) { problems.push(`systems/${name}.md is required (it holds tuning numbers)`); return [{ path: `systems/${name}.md`, data: {}, body: '' }, {}]; }
    if (!isMap(d.data.tuning)) { problems.push(`${d.path}: needs a "tuning:" block`); return [d, {}]; }
    return [d, d.data.tuning];
  };
  /** How one tuning value is read from its YAML (`key` is its full name, for the problems). */
  type Read<V> = (d: Doc, v: YamlValue | undefined, key: string) => V;
  const N: Read<number> = (d, v, key) => num(d, v, key), S: Read<string> = (d, v, key) => str(d, v, key), STOCK: Read<Stock> = stock;
  /** A list of names, which must not be empty. */
  const names = (what: string): Read<string[]> => (d, v, key) => (Array.isArray(v) && v.length ? v.map(String) : (problems.push(`${d.path}: "${key}" must be a list of ${what}`), ['']));
  /** A list, `def` if there is none. */
  const list = (def: string[]): Read<string[]> => (_d, v) => (Array.isArray(v) ? v.map(String) : def);
  const sizesOf: Read<Record<string, MapSize>> = (d, v, key) => {
    const out: Record<string, MapSize> = {};
    for (const [id, o] of Object.entries(isMap(v) ? v : {})) {
      const m = isMap(o) ? o : {};
      out[id] = { width: num(d, m.width, `${key}.${id}.width`), height: num(d, m.height, `${key}.${id}.height`), settlements: num(d, m.settlements, `${key}.${id}.settlements`), label: str(d, m.label, `${key}.${id}.label`, id), offered: m.offered !== false };
    }
    return out;
  };
  /**
   * One block of tuning: every key `spec` names (the Tuning interface's, so none is missed and none misspelt) read from
   * its snake_case name in the YAML. A key in the YAML that nothing reads (`also` names those read elsewhere) is a problem too.
   */
  const section = <T>([d, y]: [Doc, YamlMap], spec: { [K in keyof T]-?: Read<T[K]> }, at = 'tuning.', also: string[] = []): T => {
    const out = {} as T, known = new Set(also);
    for (const k in spec) { const key = k.replace(/[A-Z]/g, c => `_${c.toLowerCase()}`); known.add(key); out[k] = spec[k](d, y[key], at + key); }
    for (const key in y) if (!known.has(key)) problems.push(`${d.path}: "${at}${key}" is not a tuning key (misspelt, or no longer read?)`);
    return out;
  };
  const [md] = sys('map'), map = section<Omit<Tuning['map'], 'width' | 'height'>>(sys('map'), { treeGrowSeconds: N, standardType: S, standardSize: S, gameSize: S, sizes: sizesOf });
  const std = map.sizes[map.standardSize] ?? (problems.push(`${md.path}: tuning.standard_size must name one of tuning.sizes`), { width: 0, height: 0, settlements: 1, label: '', offered: false });
  if (!maps[map.standardType]) problems.push(`${md.path}: tuning.standard_type must name a map type in maps/`);
  const needs = sys('needs'), people = sys('people');
  const tuning: Tuning = {
    map: { width: std.width, height: std.height, ...map },
    start: section<Tuning['start']>(sys('settlement'), { villagers: N, storage: STOCK, houseStock: STOCK, names: names('settlement names'), neighbourMinDistance: N, neighbourSpacing: N, neighbourMinRoom: N, neighbourSpreadShare: N, startRoomShare: N, startWoodWeight: N }),
    logistics: section<Tuning['logistics']>(sys('logistics'), {
      villagerCarry: N, botCarry: N, villagerSpeed: N, botSpeed: N, pathSpeed: N, roadSpeed: N, forestSpeed: N, boatSpeed: N, outputCap: N, releaseAfterSeconds: N, cartCarry: N, cartPathSpeed: N, cartRoadSpeed: N, cartRoughSpeed: N, cartMinTiles: N, roundTiles: N, cartReach: N, dumpAt: N, requestAging: N, noWayRetrySeconds: N, surplusPenalty: N, harvestPriority: N, slopeCost: N, rockCost: N, stoneRoadSpeed: N,
      oxCarry: N, oxPathSpeed: N, oxRoadSpeed: N, oxRoughSpeed: N, oxMinTiles: N, oxFeed: N, hubReach: N, relayMinTiles: N, hubStock: N, relayMinLoad: N, relayBonus: N, adviseLongHauls: N, adviseFootShare: N,
    }),
    needs: section<Tuning['needs']>(needs, { eatEverySeconds: N, leaveAfterHungrySeconds: N, migrantEverySeconds: N, migrateMinMood: N, surroundingsWeight: N, tierTwo: list([]), tierThree: list([]), extrasEverySeconds: N, extrasStock: N, varietyBonus: N }, 'tuning.', ['surroundings']),
    settling: section<Tuning['settling']>(sys('settling'), { checkEverySeconds: N, minVillagers: N, cooldownSeconds: N, partySize: N, crowdedMinVillagers: N, storesShare: N, maxSettlements: N, firstHarvestSeconds: N, provisionHeadroom: N }),
    sea: section<Tuning['sea']>(sys('sea'), { shallowTiles: N, shallowSpeed: N, reefFromTiles: N, reefToTiles: N, reefCell: N, sightTiles: N, lookEverySeconds: N, exploreEverySeconds: N, dockBoats: N, partyBoatPlanks: N, villagersPerBoat: N, fleetMax: N, boatlessMemorySeconds: N, shipyardWeight: N, boatNames: names('names') }),
    people: {
      ...section<Omit<Tuning['people'], 'names'>>(people, {
        adultSeconds: N, elderSeconds: N, lifespanSeconds: N, lifespanJitterSeconds: N, founderAgeMaxSeconds: N, birthEverySeconds: N, practiceSeconds: N, apprenticeFactor: N, expertAt: N, skillSpeedup: N, riteGraceSeconds: N, ritePenalty: N,
        changeCustomAfterSeconds: N, pyreLogs: N, shipPlanks: N, customRadius: N, woodForPyre: N, waterForShip: N, feastSeconds: N, feastMood: N, harvestBread: N, fireLogs: N, woodForFire: N, feastSpread: N, feastLayIn: N, feastRetrySeconds: N, apart: N, craftPace: N, craftLookSeconds: N,
      }, 'tuning.', ['names_sea', 'names_trees', 'names_fields']),
      // each naming custom's list of names, from `names_<custom>`
      names: section<Record<Naming, string[]>>([people[0], { sea: people[1].names_sea, trees: people[1].names_trees, fields: people[1].names_fields }], { sea: names('names'), trees: names('names'), fields: names('names') }, 'tuning.names_'),
    },
    trade: section<Tuning['trade']>(sys('trade'), { everySeconds: N, load: N, keep: N, minVillagers: N, smoothingSeconds: N, distanceWeight: N, minRate: N, maxRate: N, villagersPerPorter: N, exportDemand: N, wantCover: N, spareCover: N, kinBonus: N, importPatienceSeconds: N, importShare: N }),
    conveyors: section<Tuning['conveyors']>(sys('conveyors'), { speed: N, carry: N, gapSeconds: N, reach: N, roughCost: N, lookEverySeconds: N, villagersPerBelt: N, minTiles: N, maxTiles: N, minStops: N }),
    farms: section<Tuning['farms']>(sys('farms'), { diet: list([]), dietShare: N, dietStock: N, dietSeconds: N, dietFull: N, dietBonus: N, dietWeight: N, growRoomWeight: N }),
    seasons: section<Tuning['seasons']>(sys('seasons'), { yearSeconds: N, firewoodEverySeconds: N, firewoodStock: N, coldPenalty: N, winterHeadroom: N, preserved: list([]) }),
    surroundings: section<Tuning['surroundings']>([needs[0], isMap(needs[1].surroundings) ? needs[1].surroundings : {}], { base: N, treeRadius: N, treeAmenity: N, treeMax: N, waterRadius: N, waterAmenity: N, crowdRadius: N, crowdPenalty: N, sitePenalty: N }, 'tuning.surroundings.'),
    production: section<Tuning['production']>(sys('production'), { buildSeconds: N, replantEverySeconds: N, maxTreesNearForester: N, sitePriorityTiles: N, surplusSeconds: N, surplusMin: N, surplusFullSeconds: N, freshSeconds: N }),
    planner: section<Tuning['planner']>(sys('planner'), {
      intervalSeconds: N, sitePatienceSeconds: N, buildGoods: list(['planks']), comfortWeight: N, depositWeight: N, replanMinAge: N, districtBuildings: N, districtSpacing: N, districtRoomWeight: N, replanEverySeconds: N, salvageShare: N, clearReach: N, clearTries: N, villageAt: N, townAt: N, rowWeight: N, streetWeight: N, streetEveryRows: N, streetEveryCols: N, streetRadius: N,
      detourRatio: N, detourWeight: N, bridgeReachWeight: N, bridgeMinGain: N, bridgeSpacing: N, paveWear: N, pavePerLook: N, wearHalfLifeSeconds: N, settleSeconds: N, confirmCycles: N, minSeverity: N, hallWeight: N, hallSites: N, hallMasterSites: N, millWeight: N, millMin: N,
      foodHeadroom: N, newcomerFoodShare: N, growthBeds: N, storeFullShare: N, villagersPerCartShed: N, villagersPerOxBarn: N, growthWeight: N, carrierShare: N, planksPerVillagerMinute: N, inputCover: N,
      costWeight: N, urgencyPriority: N, crossingWeight: N, savePatienceSeconds: N, noRoomRetrySeconds: N, haulWeight: N, coverWeight: N, searchRadius: N, searchRadiusMax: N, gap: N, minTrees: N,
      treeWeight: N, sharedTreeWeight: N, linkWeight: N, storeWeight: N, forestPenalty: N, renewEverySeconds: N, idleSeconds: N, keepCover: N, centreRadius: N, moveMaxSize: N, yardWeight: N, packedHomes: N,
    }),
    hardship: section<Tuning['hardship']>(sys('hardship'), {
      fireEverySeconds: N, spreadGap: N, spreadChance: N, burnSeconds: N, douseSeconds: N, rebuildShare: N, fireLoss: N, fireproof: list([]),
      floodChance: N, floodReach: N, floodHeight: N, floodSeconds: N, floodLoss: N,
      sicknessEverySeconds: N, sickAt: N, sickSeconds: N, sickSpreadGap: N, sickSpreadChance: N, sickDeath: N, healedSeconds: N, healedDeath: N, sickMood: N,
      wildDistance: N, wildTilesPerCamp: N, campEverySeconds: N, campStrength: N, campGrowSeconds: N, campMax: N, raidEverySeconds: N, raidReach: N, raidSpeed: N, raidTake: N, raidLoss: N, giftEverySeconds: N, giftBread: N, giftsToSettle: N,
      militiaShare: N, surprisedShare: N, memorySeconds: N, guardWeight: N, cleanFactor: N, rationFactor: N, rationMood: N, longPace: N, longMood: N, shortPace: N, shortMood: N, stayMood: N, starveFactor: N,
    }),
    roads: section<Tuning['roads']>(sys('roads'), { trafficFrom: N, trafficSpan: N, villagersPerRoad: N, lookEverySeconds: N, minTraffic: N, margin: N, minLength: N, demolishWeight: N, homeWeight: N, spacing: N, frontWeight: N, nearWeight: N, nearTiles: N, districtWeight: N, districtReach: N }),
    knowledge: section<Tuning['knowledge']>(sys('knowledge'), {
      haulTarget: N, haulSmoothingSeconds: N, struggleSeverity: N, encourageFactor: N, encourageThreshold: N, verifySeconds: N, forgetAfterSeconds: N, visitEverySeconds: N, visitMinVillagers: N,
      copyEverySeconds: N, universityFactor: N, universityThreshold: N, schoolFactor: N, forgettingMemorySeconds: N, learningWeight: N, universityVillagers: N, universitySpare: N, schoolChildren: N, distanceFrom: N, distanceSpan: N, longHaulFrom: N, reachSmoothing: N,
    }),
  };
  const [sd] = sys('settlement'), [fd] = sys('farms');
  for (const g of tuning.farms.diet) if (!goods[g]) problems.push(`${fd.path}: tuning.diet names "${g}", which has no goods/${g}.md`);
  if (!Object.values(blueprints).some(B => B.field)) problems.push('blueprints/field.md (field: true) is required: farms that grow lay new fields');
  checkGoods(sd, tuning.start.storage, 'tuning.storage'); checkGoods(sd, tuning.start.houseStock, 'tuning.house_stock');

  for (const B of Object.values(blueprints)) for (const id of B.discovery?.after ?? []) if (!blueprints[id]) problems.push(`blueprints/${B.id}.md: discovery.after names "${id}", which is not a blueprint`);
  for (const e of eras) for (const id of e.discoveries) if (!blueprints[id]?.discovery) problems.push(`eras/${e.id}.md: discovery "${id}" is not a blueprint that must be thought of`);
  for (const e of eras) for (const id of e.unlocks) {
    if (!blueprints[id]?.discovery) problems.push(`eras/${e.id}.md: unlocks "${id}", which is not a blueprint that must be thought of`);
    if (eras.some(o => o !== e && o.unlocks.includes(id))) problems.push(`eras/${e.id}.md: "${id}" is unlocked by more than one era`);
    if (e === eras[0]) problems.push(`eras/${e.id}.md: the first age unlocks nothing; every settlement starts in it`);
  }
  for (const B of Object.values(blueprints)) for (const k of B.mills?.types ?? []) if (!blueprints[k]) problems.push(`blueprints/${B.id}.md: mills.types names "${k}", which is not a blueprint`);
  if (problems.length) throw new ContentError(problems);
  return { goods, blueprints, maps, eras, tuning, hash };
}
