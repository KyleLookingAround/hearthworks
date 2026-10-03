/**
 * Gate 11 scenario: one self-planning settlement on the standard map for an hour, no build calls.
 * Passes when its homes climb the tiers by goods (bread; fish or cloth; tools), its homes stay stocked
 * with food, and nobody goes hungry for it.
 */
import { runTracked, standardMetrics, start, worldOf, type Scenario } from '../../../src/gates/kit.ts';
import { bp } from '../../../src/sim/index.ts';
import { homeTier } from '../../../src/sim/production.ts';

export const run: Scenario = (content, params) => {
  const { seed, seconds } = params;
  const S = start(content, seed, { planner: true, ...worldOf(params) });
  let samples = 0, stocked = 0, last = -1;
  const { minMood, minFed } = runTracked(S, seconds, 300, s => {
    // every ten seconds after the warm-up: is each lived-in home's food on the shelf?
    if (s.t < 300 || Math.floor(s.t / 10) === last) return;
    last = Math.floor(s.t / 10);
    for (const b of s.buildings) if (bp(s, b).homes && !b.site && b.residents.length) { samples++; if (homeTier(s, b) >= 1) stocked++; }
  });
  const homes = S.buildings.filter(b => bp(S, b).homes && !b.site && b.residents.length);
  const tier = (t: number) => homes.filter(b => homeTier(S, b) >= t).length / (homes.length || 1);
  const goods = new Set(S.buildings.filter(b => !b.site).flatMap(b => Object.keys(bp(S, b).output)));
  return {
    state: S,
    metrics: standardMetrics(S, {
      mood_min: minMood,
      fed_min: minFed,
      homes: homes.length,
      tier2_share: Math.round(tier(2) * 1000) / 1000,
      tier3_share: Math.round(tier(3) * 1000) / 1000,
      homes_stocked: samples ? Math.round((stocked / samples) * 1000) / 1000 : 0,
      goods_made: goods.size,
      spoiled: S.stats.spoiled,
    }),
  };
};
