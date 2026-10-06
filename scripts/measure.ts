/**
 * Measure default new games (as scripts/fingerprint.ts makes them) for design changes: one JSON line per run.
 *   node scripts/measure.ts [seconds=3600] [seeds=1,2,3,4,5,6,7,42,99,1847,2026,31337] [draws=0,1,2]
 * The k-th draw takes k values from each of S.rng, S.krng, S.prng and S.hrng right after createState, so one seed gives
 * several worlds of different luck.
 */
import { loadContent } from '../src/content/node.ts';
import { createState, rand, bp, villagers, type State } from '../src/sim/index.ts';
import { tick, STEP } from '../src/sim/tick.ts';

const args = process.argv.slice(2);
const seconds = Number(args[0] ?? 3600), seeds = (args[1] ?? '1,2,3,4,5,6,7,42,99,1847,2026,31337').split(',').map(Number), draws = (args[2] ?? '0,1,2').split(',').map(Number);
const content = loadContent();
const T = content.tuning.map;
const map = Object.values(content.maps).sort((a, b) => a.order - b.order)[0]?.id ?? T.standardType;
const size = T.sizes[T.gameSize] ? T.gameSize : T.standardSize;
const STORES = ['granary', 'smokehouse', 'warehouse'];

for (const seed of seeds) for (const k of draws) {
  const S: State = createState(content, seed, { planner: true, seasons: true, trade: process.env.TRADE !== '0', people: true, carts: true, settlers: true, charts: true, ships: true, hardship: true, plannedRoads: true, farms: true, settlements: T.sizes[size].settlements, map, size });
  for (let i = 0; i < k; i++) { rand(S.rng); rand(S.krng); rand(S.prng); rand(S.hrng); }
  let fedMin = 1, needs = 0, working = 0, last = -1;
  const built = new Set<number>(), byType: Record<string, number> = {}, needsBy: Record<string, [number, number]> = {};
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i++) {
    tick(S, STEP);
    if (S.t >= 300) fedMin = Math.min(fedMin, S.fed);
    const s = Math.floor(S.t);
    if (s === last) continue;
    last = s;
    for (const b of S.buildings) {
      const B = bp(S, b);
      if (!b.site && STORES.includes(b.type) && !built.has(b.id)) { built.add(b.id); byType[b.type] = (byType[b.type] || 0) + 1; }
      if (b.site || !B.workers || !Object.keys(B.input).length) continue;
      const n = b.status.t.startsWith('Needs ') ? 1 : 0;
      working++; needs += n;
      const e = (needsBy[b.type] ??= [0, 0]); e[0] += n; e[1]++;
    }
  }
  const traded: Record<string, number> = {};
  for (const t of S.towns) for (const g in t.trade.imported) traded[g] = (traded[g] || 0) + t.trade.imported[g];
  console.log(JSON.stringify({
    seed, k, villagers: villagers(S).length, towns: S.towns.length, departures: S.stats.departures, trades: S.stats.trades, traded,
    deaths: S.stats.deaths, starved: S.stats.starved, fedMin: +fedMin.toFixed(3), spoiled: S.stats.spoiled,
    stores: byType, needsShare: +(needs / Math.max(1, working)).toFixed(3),
    needsBy: Object.fromEntries(Object.entries(needsBy).map(([t, [n, w]]) => [t, +(n / w).toFixed(2)])),
  }));
}
