/**
 * Gate 4 scenario: no build order at all. Create the starting settlement with
 * the village planner on and let the town run. Passes when the planner grows
 * and feeds the town as well as Gate 2's scripted build order did.
 */
import { runTracked, standardMetrics, start, worldOf, type Scenario } from '../../../src/gates/kit.ts';
import { countBuilt } from '../../../src/sim/index.ts';

export const run: Scenario = (content, params) => {
  const { seed, seconds } = params;
  const S = start(content, seed, { planner: true, ...worldOf(params) });
  const { minMood } = runTracked(S, seconds, 300);
  return {
    state: S,
    metrics: standardMetrics(S, {
      mood_min: minMood,
      planned: S.planner.placed,
      houses: countBuilt(S, 'house'),
      bakeries: countBuilt(S, 'bakery'),
      farms: countBuilt(S, 'farm'),
      foresters: countBuilt(S, 'forester'),
      sawmills: countBuilt(S, 'sawmill'),
    }),
  };
};
