/**
 * Builds game content from the design bundle. Blueprints, goods and tuning
 * numbers are read from the same OKF concept documents people and agents
 * edit, so the design docs cannot drift from the running game.
 */
import { parseDoc, type Doc } from './frontmatter.ts';
import type { YamlMap, YamlValue } from './yaml.ts';
import type { BlueprintDef, Content, GoodDef, MapDef, MapSize, Stock, Tuning } from '../sim/types.ts';

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
const NEEDS = ['hauling', 'crossing', 'detours'];
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
      shore: f.shore === true,
      zone: f.zone === 'farms' || f.zone === 'workshops' || f.zone === 'homes' ? f.zone : (num(d, f.homes, 'homes', 0) > 0 ? 'homes' : null),
      seasonal: f.seasonal === true,
      rite: f.rite === 'burial' || f.rite === 'cremation' || f.rite === 'ship' ? f.rite : null,
      graves: typeof f.graves === 'number' ? f.graves : 0,
      form: f.form === 'town' ? 'town' : f.form === 'village' ? 'village' : 'hamlet',
      bridge: bridge ? { maxSpan: num(d, bridge.max_span, 'bridge.max_span') } : null,
      nuisance: nuisance ? { radius: num(d, nuisance.radius, 'nuisance.radius'), amount: num(d, nuisance.amount, 'nuisance.amount') } : null,
      discovery: discovery ? { need: str(d, discovery.need, 'discovery.need'), meanSeconds: num(d, discovery.mean_seconds, 'discovery.mean_seconds') } : null,
    };
    if (bp.discovery && !NEEDS.includes(bp.discovery.need)) problems.push(`${d.path}: discovery.need "${bp.discovery.need}" is not one of ${NEEDS.join(', ')}`);
    if (bp.workers > 1) problems.push(`${d.path}: workers above 1 are not supported yet`);
    if (Object.keys(bp.output).length && bp.seconds <= 0) problems.push(`${d.path}: recipe.seconds must be above 0 when there is an output`);
    if (Object.keys(bp.output).length && !bp.workers) problems.push(`${d.path}: a recipe needs workers: 1`);
    checkGoods(d, bp.cost, 'cost'); checkGoods(d, bp.input, 'recipe.input'); checkGoods(d, bp.output, 'recipe.output'); checkGoods(d, bp.keepStocked, 'keep_stocked');
    blueprints[id] = bp;
  }
  for (const need of ['storage', 'house']) if (!blueprints[need]) problems.push(`blueprints/${need}.md is required: the starting settlement uses it`);

  // map types
  const maps: Record<string, MapDef> = {};
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
    };
  }

  // tuning, one block per system doc
  const sys = (name: string): [Doc, YamlMap] => {
    const d = docs.find(x => x.path === `systems/${name}.md`);
    if (!d) { problems.push(`systems/${name}.md is required (it holds tuning numbers)`); return [{ path: `systems/${name}.md`, data: {}, body: '' }, {}]; }
    if (!isMap(d.data.tuning)) { problems.push(`${d.path}: needs a "tuning:" block`); return [d, {}]; }
    return [d, d.data.tuning];
  };
  const [md, mt] = sys('map'), [sd, st] = sys('settlement'), [ld, lt] = sys('logistics'), [nd, nt] = sys('needs'), [pd, pt] = sys('production'), [qd, qt] = sys('planner'), [kd, kt] = sys('knowledge'), [ed, et] = sys('seasons'), [td, tt] = sys('trade'), [od, ot] = sys('people');
  const sizes: Record<string, MapSize> = {};
  for (const [id, v] of Object.entries(isMap(mt.sizes) ? mt.sizes : {})) {
    const m = isMap(v) ? v : {};
    sizes[id] = { width: num(md, m.width, `tuning.sizes.${id}.width`), height: num(md, m.height, `tuning.sizes.${id}.height`), settlements: num(md, m.settlements, `tuning.sizes.${id}.settlements`), label: str(md, m.label, `tuning.sizes.${id}.label`, id), offered: m.offered !== false };
  }
  const std = sizes[String(mt.standard_size)] ?? (problems.push(`${md.path}: tuning.standard_size must name one of tuning.sizes`), { width: 0, height: 0, settlements: 1, label: '', offered: false });
  if (!maps[String(mt.standard_type)]) problems.push(`${md.path}: tuning.standard_type must name a map type in maps/`);
  const q = (k: string) => num(qd, qt[k], `tuning.${k}`), k = (key: string) => num(kd, kt[key], `tuning.${key}`);
  const tuning: Tuning = {
    map: { width: std.width, height: std.height, treeGrowSeconds: num(md, mt.tree_grow_seconds, 'tuning.tree_grow_seconds'), standardType: str(md, mt.standard_type, 'tuning.standard_type'), standardSize: str(md, mt.standard_size, 'tuning.standard_size'), gameSize: str(md, mt.game_size, 'tuning.game_size'), sizes },
    start: {
      villagers: num(sd, st.villagers, 'tuning.villagers'), storage: stock(sd, st.storage, 'tuning.storage'), houseStock: stock(sd, st.house_stock, 'tuning.house_stock'),
      names: Array.isArray(st.names) && st.names.length ? st.names.map(String) : (problems.push(`${sd.path}: "tuning.names" must be a list of settlement names`), ['']),
      neighbourMinDistance: num(sd, st.neighbour_min_distance, 'tuning.neighbour_min_distance'), neighbourSpacing: num(sd, st.neighbour_spacing, 'tuning.neighbour_spacing'), neighbourMinRoom: num(sd, st.neighbour_min_room, 'tuning.neighbour_min_room'), neighbourSpreadShare: num(sd, st.neighbour_spread_share, 'tuning.neighbour_spread_share'), startRoomShare: num(sd, st.start_room_share, 'tuning.start_room_share'), startWoodWeight: num(sd, st.start_wood_weight, 'tuning.start_wood_weight'),
    },
    logistics: {
      villagerCarry: num(ld, lt.villager_carry, 'tuning.villager_carry'), botCarry: num(ld, lt.bot_carry, 'tuning.bot_carry'),
      villagerSpeed: num(ld, lt.villager_speed, 'tuning.villager_speed'), botSpeed: num(ld, lt.bot_speed, 'tuning.bot_speed'),
      roadSpeed: num(ld, lt.road_speed, 'tuning.road_speed'), boatSpeed: num(ld, lt.boat_speed, 'tuning.boat_speed'), forestSpeed: num(ld, lt.forest_speed, 'tuning.forest_speed'),
      outputCap: num(ld, lt.output_cap, 'tuning.output_cap'), releaseAfterSeconds: num(ld, lt.release_after_seconds, 'tuning.release_after_seconds'), dumpAt: num(ld, lt.dump_at, 'tuning.dump_at'), requestAging: num(ld, lt.request_aging, 'tuning.request_aging'), noWayRetrySeconds: num(ld, lt.no_way_retry_seconds, 'tuning.no_way_retry_seconds'), slopeCost: num(ld, lt.slope_cost, 'tuning.slope_cost'), rockCost: num(ld, lt.rock_cost, 'tuning.rock_cost'),
    },
    needs: {
      eatEverySeconds: num(nd, nt.eat_every_seconds, 'tuning.eat_every_seconds'), leaveAfterHungrySeconds: num(nd, nt.leave_after_hungry_seconds, 'tuning.leave_after_hungry_seconds'),
      migrantEverySeconds: num(nd, nt.migrant_every_seconds, 'tuning.migrant_every_seconds'), migrateMinMood: num(nd, nt.migrate_min_mood, 'tuning.migrate_min_mood'), surroundingsWeight: num(nd, nt.surroundings_weight, 'tuning.surroundings_weight'),
      tierTwo: Array.isArray(nt.tier_two) ? nt.tier_two.map(String) : [], tierThree: Array.isArray(nt.tier_three) ? nt.tier_three.map(String) : [],
      extrasEverySeconds: num(nd, nt.extras_every_seconds, 'tuning.extras_every_seconds'), extrasStock: num(nd, nt.extras_stock, 'tuning.extras_stock'), varietyBonus: num(nd, nt.variety_bonus, 'tuning.variety_bonus'),
    },
    people: (() => { const g = (k: string) => num(od, ot[k], `tuning.${k}`); return {
      adultSeconds: g('adult_seconds'), elderSeconds: g('elder_seconds'), lifespanSeconds: g('lifespan_seconds'), lifespanJitterSeconds: g('lifespan_jitter_seconds'), founderAgeMaxSeconds: g('founder_age_max_seconds'), birthEverySeconds: g('birth_every_seconds'),
      practiceSeconds: g('practice_seconds'), apprenticeFactor: g('apprentice_factor'), expertAt: g('expert_at'), skillSpeedup: g('skill_speedup'), riteGraceSeconds: g('rite_grace_seconds'), ritePenalty: g('rite_penalty'),
      changeCustomAfterSeconds: g('change_custom_after_seconds'), pyreLogs: g('pyre_logs'), shipPlanks: g('ship_planks'), customRadius: g('custom_radius'), woodForPyre: g('wood_for_pyre'), waterForShip: g('water_for_ship'),
    }; })(),
    trade: {
      everySeconds: num(td, tt.every_seconds, 'tuning.every_seconds'), load: num(td, tt.load, 'tuning.load'), keep: num(td, tt.keep, 'tuning.keep'), minVillagers: num(td, tt.min_villagers, 'tuning.min_villagers'),
      smoothingSeconds: num(td, tt.smoothing_seconds, 'tuning.smoothing_seconds'), distanceWeight: num(td, tt.distance_weight, 'tuning.distance_weight'), minRate: num(td, tt.min_rate, 'tuning.min_rate'), maxRate: num(td, tt.max_rate, 'tuning.max_rate'), villagersPerPorter: num(td, tt.villagers_per_porter, 'tuning.villagers_per_porter'), exportDemand: num(td, tt.export_demand, 'tuning.export_demand'), wantCover: num(td, tt.want_cover, 'tuning.want_cover'), spareCover: num(td, tt.spare_cover, 'tuning.spare_cover'),
    },
    seasons: {
      yearSeconds: num(ed, et.year_seconds, 'tuning.year_seconds'), firewoodEverySeconds: num(ed, et.firewood_every_seconds, 'tuning.firewood_every_seconds'),
      firewoodStock: num(ed, et.firewood_stock, 'tuning.firewood_stock'), coldPenalty: num(ed, et.cold_penalty, 'tuning.cold_penalty'), winterHeadroom: num(ed, et.winter_headroom, 'tuning.winter_headroom'),
      preserved: Array.isArray(et.preserved) ? et.preserved.map(String) : [],
    },
    surroundings: (() => {
      const su = isMap(nt.surroundings) ? nt.surroundings : {}, g = (k: string) => num(nd, su[k], `tuning.surroundings.${k}`);
      return { base: g('base'), treeRadius: g('tree_radius'), treeAmenity: g('tree_amenity'), treeMax: g('tree_max'), waterRadius: g('water_radius'), waterAmenity: g('water_amenity'), crowdRadius: g('crowd_radius'), crowdPenalty: g('crowd_penalty'), sitePenalty: g('site_penalty') };
    })(),
    production: {
      buildSeconds: num(pd, pt.build_seconds, 'tuning.build_seconds'), replantEverySeconds: num(pd, pt.replant_every_seconds, 'tuning.replant_every_seconds'),
      maxTreesNearForester: num(pd, pt.max_trees_near_forester, 'tuning.max_trees_near_forester'),
      sitePriorityTiles: num(pd, pt.site_priority_tiles, 'tuning.site_priority_tiles'),
    },
    planner: {
      intervalSeconds: q('interval_seconds'), sitePatienceSeconds: q('site_patience_seconds'), buildGoods: Array.isArray(qt.build_goods) ? qt.build_goods.map(String) : ['planks'], comfortWeight: q('comfort_weight'), depositWeight: q('deposit_weight'), replanMinAge: q('replan_min_age'), districtBuildings: q('district_buildings'), districtSpacing: q('district_spacing'), districtRoomWeight: q('district_room_weight'), replanEverySeconds: q('replan_every_seconds'), salvageShare: q('salvage_share'), villageAt: q('village_at'), townAt: q('town_at'), rowWeight: q('row_weight'), streetWeight: q('street_weight'), streetEveryRows: q('street_every_rows'), streetEveryCols: q('street_every_cols'), streetRadius: q('street_radius'), detourRatio: q('detour_ratio'), detourWeight: q('detour_weight'), bridgeReachWeight: q('bridge_reach_weight'), bridgeMinGain: q('bridge_min_gain'), bridgeSpacing: q('bridge_spacing'), paveWear: q('pave_wear'), pavePerLook: q('pave_per_look'), wearHalfLifeSeconds: q('wear_half_life_seconds'), settleSeconds: q('settle_seconds'), confirmCycles: q('confirm_cycles'), minSeverity: q('min_severity'),
      foodHeadroom: q('food_headroom'), growthBeds: q('growth_beds'), storeFullShare: q('store_full_share'), growthWeight: q('growth_weight'), carrierShare: q('carrier_share'), planksPerVillagerMinute: q('planks_per_villager_minute'), inputCover: q('input_cover'),
      costWeight: q('cost_weight'), urgencyPriority: q('urgency_priority'), crossingWeight: q('crossing_weight'), savePatienceSeconds: q('save_patience_seconds'), noRoomRetrySeconds: q('no_room_retry_seconds'), haulWeight: q('haul_weight'), coverWeight: q('cover_weight'),
      searchRadius: q('search_radius'), searchRadiusMax: q('search_radius_max'), gap: q('gap'), minTrees: q('min_trees'),
      treeWeight: q('tree_weight'), sharedTreeWeight: q('shared_tree_weight'), linkWeight: q('link_weight'), storeWeight: q('store_weight'), forestPenalty: q('forest_penalty'),
    },
    knowledge: {
      haulTarget: k('haul_target'), haulSmoothingSeconds: k('haul_smoothing_seconds'), struggleSeverity: k('struggle_severity'), encourageFactor: k('encourage_factor'), encourageThreshold: k('encourage_threshold'),
      verifySeconds: k('verify_seconds'), forgetAfterSeconds: k('forget_after_seconds'), visitEverySeconds: k('visit_every_seconds'), visitMinVillagers: k('visit_min_villagers'),
    },
  };
  checkGoods(sd, tuning.start.storage, 'tuning.storage'); checkGoods(sd, tuning.start.houseStock, 'tuning.house_stock');

  if (problems.length) throw new ContentError(problems);
  return { goods, blueprints, maps, tuning, hash };
}
