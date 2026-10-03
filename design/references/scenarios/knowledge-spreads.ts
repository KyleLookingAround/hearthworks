/**
 * Gate 5 scenario: two settlements on one island, both planning for themselves,
 * neither knowing the Courier Depot. No build calls. Passes when a practice one
 * village came up with reaches the other through a visitor and is proven in use there.
 */
import { runTracked, standardMetrics, start, type Scenario } from '../../../src/gates/kit.ts';
import { countBuilt } from '../../../src/sim/index.ts';

export const run: Scenario = (content, { seed, seconds }) => {
  const S = start(content, seed, { planner: true, settlements: 2 });
  const { minMood } = runTracked(S, seconds, 300);
  let practiceSpread = 0;
  for (const town of S.towns) for (const k of Object.values(town.knows)) {
    if (k.from && k.verified.some(v => v.by === town.name)) practiceSpread++;
  }
  return {
    state: S,
    metrics: standardMetrics(S, {
      mood_min: minMood,
      settlements: S.towns.length,
      invented: S.stats.invented,
      taught: S.stats.taught,
      forgotten: S.stats.forgotten,
      practice_spread: practiceSpread,
      depots: countBuilt(S, 'depot'),
    }),
  };
};
