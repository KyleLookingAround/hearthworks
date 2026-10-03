/**
 * Gate 8 scenario: one self-planning settlement on a landmass with rivers, played twice from the
 * same seed: once with the village paving the paths its people wear, once without. No build calls.
 * Passes when paving cuts the mean delivery time, the village bridges water on its own, no home
 * sits within a noisy workplace's reach, and everyone stays fed.
 */
import { runTracked, standardMetrics, start, worldOf, type Scenario } from '../../../src/gates/kit.ts';
import { countBuilt } from '../../../src/sim/index.ts';
import { homesInNuisance } from '../../../src/sim/surroundings.ts';

export const run: Scenario = (content, params) => {
  const { seed, seconds } = params;
  const mean = (s: { stats: { deliverySeconds: number; delivered: number } }) => s.stats.delivered ? s.stats.deliverySeconds / s.stats.delivered : 0;
  // seconds per straight-line tile: a paved village grows bigger and its trips longer, so time alone undersells roads
  const pace = (s: { stats: { deliverySeconds: number; deliveryTiles: number } }) => s.stats.deliveryTiles ? s.stats.deliverySeconds / s.stats.deliveryTiles : 0;

  const off = start(content, seed, { planner: true, roads: false, ...worldOf(params) });
  runTracked(off, seconds);

  const S = start(content, seed, { planner: true, roads: true, ...worldOf(params) });
  let worstNuisance = 0;
  const { minMood, minFed } = runTracked(S, seconds, 300, s => { worstNuisance = Math.max(worstNuisance, homesInNuisance(s)); });
  let roads = 0;
  for (const r of S.world.road) roads += r;
  const on = mean(S), was = mean(off);
  return {
    state: S,
    metrics: standardMetrics(S, {
      mood_min: minMood,
      fed_min: minFed,
      mean_delivery_seconds: Math.round(on * 100) / 100,
      mean_delivery_seconds_unpaved: Math.round(was * 100) / 100,
      delivery_cut: was ? Math.round((1 - on / was) * 1000) / 1000 : 0,
      delivery_pace: Math.round(pace(S) * 1000) / 1000,
      delivery_pace_unpaved: Math.round(pace(off) * 1000) / 1000,
      pace_cut: pace(off) ? Math.round((1 - pace(S) / pace(off)) * 1000) / 1000 : 0,
      road_tiles: roads,
      bridge_known: S.towns[0].knows.bridge ? 1 : 0,
      bridges_built: countBuilt(S, 'bridge'),
      homes_in_nuisance: worstNuisance,
    }),
  };
};
