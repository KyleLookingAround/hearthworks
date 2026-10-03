/**
 * Builds game content from the design bundle. Blueprints, goods and tuning
 * numbers are read from the same OKF concept documents people and agents
 * edit, so the design docs cannot drift from the running game.
 */
import { parseDoc, type Doc } from './frontmatter.ts';
import type { YamlMap, YamlValue } from './yaml.ts';
import type { BlueprintDef, Content, GoodDef, Stock, Tuning } from '../sim/types.ts';

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
    };
    if (bp.workers > 1) problems.push(`${d.path}: workers above 1 are not supported yet`);
    if (Object.keys(bp.output).length && bp.seconds <= 0) problems.push(`${d.path}: recipe.seconds must be above 0 when there is an output`);
    if (Object.keys(bp.output).length && !bp.workers) problems.push(`${d.path}: a recipe needs workers: 1`);
    checkGoods(d, bp.cost, 'cost'); checkGoods(d, bp.input, 'recipe.input'); checkGoods(d, bp.output, 'recipe.output'); checkGoods(d, bp.keepStocked, 'keep_stocked');
    blueprints[id] = bp;
  }
  for (const need of ['storage', 'house']) if (!blueprints[need]) problems.push(`blueprints/${need}.md is required: the starting settlement uses it`);

  // tuning, one block per system doc
  const sys = (name: string): [Doc, YamlMap] => {
    const d = docs.find(x => x.path === `systems/${name}.md`);
    if (!d) { problems.push(`systems/${name}.md is required (it holds tuning numbers)`); return [{ path: `systems/${name}.md`, data: {}, body: '' }, {}]; }
    if (!isMap(d.data.tuning)) { problems.push(`${d.path}: needs a "tuning:" block`); return [d, {}]; }
    return [d, d.data.tuning];
  };
  const [md, mt] = sys('map'), [sd, st] = sys('settlement'), [ld, lt] = sys('logistics'), [nd, nt] = sys('needs'), [pd, pt] = sys('production');
  const tuning: Tuning = {
    map: { width: num(md, mt.width, 'tuning.width'), height: num(md, mt.height, 'tuning.height'), treeGrowSeconds: num(md, mt.tree_grow_seconds, 'tuning.tree_grow_seconds') },
    start: { villagers: num(sd, st.villagers, 'tuning.villagers'), storage: stock(sd, st.storage, 'tuning.storage'), houseStock: stock(sd, st.house_stock, 'tuning.house_stock') },
    logistics: {
      villagerCarry: num(ld, lt.villager_carry, 'tuning.villager_carry'), botCarry: num(ld, lt.bot_carry, 'tuning.bot_carry'),
      villagerSpeed: num(ld, lt.villager_speed, 'tuning.villager_speed'), botSpeed: num(ld, lt.bot_speed, 'tuning.bot_speed'),
      roadSpeed: num(ld, lt.road_speed, 'tuning.road_speed'), forestSpeed: num(ld, lt.forest_speed, 'tuning.forest_speed'),
      outputCap: num(ld, lt.output_cap, 'tuning.output_cap'), dumpAt: num(ld, lt.dump_at, 'tuning.dump_at'),
    },
    needs: {
      eatEverySeconds: num(nd, nt.eat_every_seconds, 'tuning.eat_every_seconds'), leaveAfterHungrySeconds: num(nd, nt.leave_after_hungry_seconds, 'tuning.leave_after_hungry_seconds'),
      migrantEverySeconds: num(nd, nt.migrant_every_seconds, 'tuning.migrant_every_seconds'), migrateMinMood: num(nd, nt.migrate_min_mood, 'tuning.migrate_min_mood'),
    },
    production: {
      buildSeconds: num(pd, pt.build_seconds, 'tuning.build_seconds'), replantEverySeconds: num(pd, pt.replant_every_seconds, 'tuning.replant_every_seconds'),
      maxTreesNearForester: num(pd, pt.max_trees_near_forester, 'tuning.max_trees_near_forester'),
    },
  };
  checkGoods(sd, tuning.start.storage, 'tuning.storage'); checkGoods(sd, tuning.start.houseStock, 'tuning.house_stock');

  if (problems.length) throw new ContentError(problems);
  return { goods, blueprints, tuning, hash };
}
