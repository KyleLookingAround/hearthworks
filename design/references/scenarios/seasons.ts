/**
 * Gate 12 scenario: one self-planning settlement on the standard map with seasons on, for three years.
 * No build calls. Passes when it gets through every winter: food stored by the first frost covers that
 * winter's need, hardly anyone leaves, and being fed holds up.
 */
import { runTracked, standardMetrics, start, worldOf, type Scenario } from '../../../src/gates/kit.ts';
import { bp, seasonOf, villagers } from '../../../src/sim/index.ts';

export const run: Scenario = (content, params) => {
  const { seed, seconds } = params;
  const Z = content.tuning.seasons;
  const S = start(content, seed, { planner: true, seasons: true, ...worldOf(params) });
  let frost = -1, last = seasonOf(S), coldest = 1;
  const { minMood, minFed } = runTracked(S, seconds, 300, s => {
    const now = seasonOf(s);
    // at the first frost: food in store against the winter's meals (a quarter year for everyone)
    if (now === 'winter' && last !== 'winter' && frost < 0) {
      let stored = 0;
      for (const b of s.buildings) if (bp(s, b).storage && !b.site) for (const g of ['wheat', 'bread', ...Z.preserved]) stored += b.inv[g] || 0;
      const need = villagers(s).length * (Z.yearSeconds / 4) / content.tuning.needs.eatEverySeconds;
      frost = need ? stored / need : 1;
    }
    if (now === 'winter') coldest = Math.min(coldest, s.mood);
    last = now;
  });
  return {
    state: S,
    metrics: standardMetrics(S, {
      mood_min: minMood,
      fed_min: minFed,
      years: Math.round((S.t / Z.yearSeconds) * 100) / 100,
      frost_cover: Math.round(frost * 1000) / 1000,
      departure_share: S.stats.peakVillagers ? Math.round((S.stats.departures / S.stats.peakVillagers) * 1000) / 1000 : 0,
      winter_mood_min: Math.round(coldest * 1000) / 1000,
    }),
  };
};
