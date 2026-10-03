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
const NEEDS = ['hauling'];
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
    goods[id] = { id, name: str(d, d.data.title, 'title'), color: str(d, d.data.color, 'color'), description: str(d, d.data.description, 'description', ''), order: num(d, d.data.order, 'order', 99) };
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
      paves: f.paves === true,
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
    if (!['island', 'landmass', 'coast'].includes(shape)) problems.push(`${d.path}: shape "${shape}" is not island, landmass or coast`);
    maps[id] = {
      id, name: str(d, f.title, 'title'), description: str(d, f.description, 'description', ''), order: num(d, f.order, 'order', 99),
      shape: shape as MapDef['shape'], coastline: num(d, f.coastline, 'coastline', 0.6),
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
  const [md, mt] = sys('map'), [sd, st] = sys('settlement'), [ld, lt] = sys('logistics'), [nd, nt] = sys('needs'), [pd, pt] = sys('production'), [qd, qt] = sys('planner'), [kd, kt] = sys('knowledge');
  const sizes: Record<string, MapSize> = {};
  for (const [id, v] of Object.entries(isMap(mt.sizes) ? mt.sizes : {})) {
    const m = isMap(v) ? v : {};
    sizes[id] = { width: num(md, m.width, `tuning.sizes.${id}.width`), height: num(md, m.height, `tuning.sizes.${id}.height`), settlements: num(md, m.settlements, `tuning.sizes.${id}.settlements`) };
  }
  const std = sizes[String(mt.standard_size)] ?? (problems.push(`${md.path}: tuning.standard_size must name one of tuning.sizes`), { width: 0, height: 0, settlements: 1 });
  if (!maps[String(mt.standard_type)]) problems.push(`${md.path}: tuning.standard_type must name a map type in maps/`);
  const q = (k: string) => num(qd, qt[k], `tuning.${k}`), k = (key: string) => num(kd, kt[key], `tuning.${key}`);
  const tuning: Tuning = {
    map: { width: std.width, height: std.height, treeGrowSeconds: num(md, mt.tree_grow_seconds, 'tuning.tree_grow_seconds'), standardType: str(md, mt.standard_type, 'tuning.standard_type'), standardSize: str(md, mt.standard_size, 'tuning.standard_size'), sizes },
    start: {
      villagers: num(sd, st.villagers, 'tuning.villagers'), storage: stock(sd, st.storage, 'tuning.storage'), houseStock: stock(sd, st.house_stock, 'tuning.house_stock'),
      names: Array.isArray(st.names) && st.names.length ? st.names.map(String) : (problems.push(`${sd.path}: "tuning.names" must be a list of settlement names`), ['']),
      neighbourMinDistance: num(sd, st.neighbour_min_distance, 'tuning.neighbour_min_distance'), neighbourSpacing: num(sd, st.neighbour_spacing, 'tuning.neighbour_spacing'),
    },
    logistics: {
      villagerCarry: num(ld, lt.villager_carry, 'tuning.villager_carry'), botCarry: num(ld, lt.bot_carry, 'tuning.bot_carry'),
      villagerSpeed: num(ld, lt.villager_speed, 'tuning.villager_speed'), botSpeed: num(ld, lt.bot_speed, 'tuning.bot_speed'),
      roadSpeed: num(ld, lt.road_speed, 'tuning.road_speed'), forestSpeed: num(ld, lt.forest_speed, 'tuning.forest_speed'),
      outputCap: num(ld, lt.output_cap, 'tuning.output_cap'), dumpAt: num(ld, lt.dump_at, 'tuning.dump_at'), requestAging: num(ld, lt.request_aging, 'tuning.request_aging'),
    },
    needs: {
      eatEverySeconds: num(nd, nt.eat_every_seconds, 'tuning.eat_every_seconds'), leaveAfterHungrySeconds: num(nd, nt.leave_after_hungry_seconds, 'tuning.leave_after_hungry_seconds'),
      migrantEverySeconds: num(nd, nt.migrant_every_seconds, 'tuning.migrant_every_seconds'), migrateMinMood: num(nd, nt.migrate_min_mood, 'tuning.migrate_min_mood'),
    },
    production: {
      buildSeconds: num(pd, pt.build_seconds, 'tuning.build_seconds'), replantEverySeconds: num(pd, pt.replant_every_seconds, 'tuning.replant_every_seconds'),
      maxTreesNearForester: num(pd, pt.max_trees_near_forester, 'tuning.max_trees_near_forester'),
      sitePriorityTiles: num(pd, pt.site_priority_tiles, 'tuning.site_priority_tiles'),
    },
    planner: {
      intervalSeconds: q('interval_seconds'), settleSeconds: q('settle_seconds'), confirmCycles: q('confirm_cycles'), minSeverity: q('min_severity'),
      foodHeadroom: q('food_headroom'), growthBeds: q('growth_beds'), growthWeight: q('growth_weight'), carrierShare: q('carrier_share'), planksPerVillagerMinute: q('planks_per_villager_minute'), inputCover: q('input_cover'),
      costWeight: q('cost_weight'), urgencyPriority: q('urgency_priority'), savePatienceSeconds: q('save_patience_seconds'), haulWeight: q('haul_weight'), coverWeight: q('cover_weight'),
      searchRadius: q('search_radius'), gap: q('gap'), minTrees: q('min_trees'),
      treeWeight: q('tree_weight'), sharedTreeWeight: q('shared_tree_weight'), linkWeight: q('link_weight'), storeWeight: q('store_weight'), forestPenalty: q('forest_penalty'),
    },
    knowledge: {
      haulTarget: k('haul_target'), haulSmoothingSeconds: k('haul_smoothing_seconds'), struggleSeverity: k('struggle_severity'),
      verifySeconds: k('verify_seconds'), forgetAfterSeconds: k('forget_after_seconds'), visitEverySeconds: k('visit_every_seconds'), visitMinVillagers: k('visit_min_villagers'),
    },
  };
  checkGoods(sd, tuning.start.storage, 'tuning.storage'); checkGoods(sd, tuning.start.houseStock, 'tuning.house_stock');

  if (problems.length) throw new ContentError(problems);
  return { goods, blueprints, maps, tuning, hash };
}
