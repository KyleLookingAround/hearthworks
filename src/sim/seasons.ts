import { bp } from './core.ts';
import type { State, Town } from './types.ts';

export type Season = 'spring' | 'summer' | 'autumn' | 'winter';
const SEASONS: Season[] = ['spring', 'summer', 'autumn', 'winter'];

/**
 * Where in the year summer and winter (the first frost) begin: the seasons are its quarters, in order. These follow
 * from `seasonOf`, not from tuning: change the seasons and they change with them.
 */
export const SUMMER_AT = 1 / SEASONS.length, FROST_AT = SEASONS.indexOf('winter') / SEASONS.length;

/** The season now, or null with seasons off. The year opens in spring; each season is a quarter of `year_seconds`. */
export function seasonOf(S: State): Season | null {
  if (!S.seasons) return null;
  const Y = S.content.tuning.seasons.yearSeconds;
  return SEASONS[Math.floor(((S.t % Y) / Y) * 4) % 4];
}

/**
 * The share of what its people and one more eat that a self-planning settlement's food must be made at for a newcomer
 * to come: the planner's `newcomer_food_share`, the store making up the rest; but in winter, with the fields resting and
 * every hand carrying, the bakeries cannot catch up once behind, so `winter_food_share`.
 */
export const newcomerShare = (S: State): number => (seasonOf(S) === 'winter' ? S.content.tuning.seasons.winterFoodShare : S.content.tuning.planner.newcomerFoodShare);

/**
 * Is a settlement's winter store on track, counting `extra` more mouths? From the start of summer to the
 * first frost, the grain, bread and preserved food in its stores must keep pace with the winter's meals and
 * `winter_headroom` more: none at the start of summer, half at its end, all by the frost. Through the winter,
 * what is left must cover what is left of it (with `winter_headroom` to take anyone more in), at the rationed rate while
 * the settlement rations food. Always true without seasons. `spend` counts that much less in store.
 */
export function storesOnTrack(S: State, t: Town, extra = 0, spend = 0): boolean {
  if (!S.seasons) return true;
  const Z = S.content.tuning.seasons, phase = (S.t % Z.yearSeconds) / Z.yearSeconds;
  // (`spend`: that much less in store, as when a founding party takes its provisions)
  let stored = -spend, pop = extra;
  for (const b of S.buildings) if (b.town === t.id && bp(S, b).storage && !b.site) for (const g of ['wheat', 'bread', ...Z.preserved]) stored += b.inv[g] || 0;
  for (const a of S.agents) if (a.kind === 'villager' && a.home?.town === t.id) pop++;
  // (rationing stretches the store: everyone eats `ration_factor` times less often)
  const meals = (seconds: number) => (pop * seconds) / (S.content.tuning.needs.eatEverySeconds * (t.laws.rationing ? S.content.tuning.hardship.rationFactor : 1));
  if (phase >= FROST_AT) return stored >= meals((1 - phase) * Z.yearSeconds) * (extra > 0 ? Z.winterHeadroom : 1);
  return stored >= meals(Z.yearSeconds / 4) * Z.winterHeadroom * Math.max(0, (phase - SUMMER_AT) / (FROST_AT - SUMMER_AT));
}
