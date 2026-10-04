/**
 * Gate 22 scenario: one self-planning settlement on the standard map with seasons and farms that grow on, for
 * `seconds`. No build calls. Watched: how big its farms grow and how many hands work one at once; how much its
 * first farm to reach its largest size makes per tile while it works there, against its first farm while a
 * smallholding; the foods its homes eat; and whether every home lived in for a year has eaten two foods or more
 * in the last year.
 */
import { runTracked, standardMetrics, start, worldOf, type Scenario } from '../../../src/gates/kit.ts';
import { bp, seasonOf } from '../../../src/sim/index.ts';
import { crew, foodsEaten, maxSize } from '../../../src/sim/farms.ts';

export const run: Scenario = (content, params) => {
  const { seed, seconds } = params;
  const S = start(content, seed, { planner: true, seasons: true, farms: true, ...worldOf(params) });
  const Y = content.tuning.seasons.yearSeconds;
  // per farm and size: made while working, and tile-seconds working
  const yields = new Map<number, Map<number, { made: number; tileSeconds: number }>>();
  const last = new Map<number, number>(), lived = new Map<number, number>();
  let maxHands = 0, grownAt = -1;
  const { minFed } = runTracked(S, seconds, 300, s => {
    for (const b of s.buildings) {
      const B = bp(s, b);
      if (B.homes && b.residents.length && !lived.has(b.id)) lived.set(b.id, s.t);
      if (!B.grows || b.site) continue;
      maxHands = Math.max(maxHands, crew(b).filter(id => s.amap.get(id)?.state === 'working').length);
      if (grownAt < 0 && b.size === maxSize(B)) grownAt = s.t;
      const by = yields.get(b.id) ?? new Map(), y = by.get(b.size) ?? { made: 0, tileSeconds: 0 };
      // what it made since the last second, against its fields for each second it works
      y.made += b.made - (last.get(b.id) ?? b.made);
      if (b.status.l === 'ok' && seasonOf(s) !== 'winter') y.tileSeconds += b.w * b.h;
      last.set(b.id, b.made); by.set(b.size, y); yields.set(b.id, by);
    }
  });
  const farms = S.buildings.filter(b => b.type === 'farm' && !b.site).sort((a, b) => a.id - b.id);
  const rate = (id: number, size: number) => { const y = yields.get(id)?.get(size); return y && y.tileSeconds ? y.made / y.tileSeconds : 0; };
  const first = farms[0], top = farms.find(b => b.size === maxSize(bp(S, b)));
  const small = first ? rate(first.id, 0) : 0, big = top ? rate(top.id, top.size) : 0;
  const homes = S.buildings.filter(b => bp(S, b).homes && b.residents.length && S.t - (lived.get(b.id) ?? S.t) >= Y);
  const r = (v: number) => Math.round(v * 1000) / 1000;
  return {
    state: S,
    metrics: standardMetrics(S, {
      fed_min: minFed,
      farms_at_largest: S.buildings.filter(b => bp(S, b).grows && !b.site && b.size === maxSize(bp(S, b))).length,
      first_largest_at: Math.round(grownAt),
      fields_laid: S.stats.grown,
      max_hands: maxHands,
      yield_per_tile_small: r(small * 1000),
      yield_per_tile_largest: r(big * 1000),
      yield_per_tile_ratio: small ? r(big / small) : 0,
      foods_eaten: Object.values(S.stats.eaten).filter(n => n > 0).length,
      bread_share: r((S.stats.eaten.bread || 0) / Math.max(1, Object.values(S.stats.eaten).reduce((a, n) => a + n, 0))),
      homes_a_year: homes.length,
      varied_homes_share: homes.length ? r(homes.filter(b => foodsEaten(S, b, Y) >= 2).length / homes.length) : 0,
    }),
  };
};
