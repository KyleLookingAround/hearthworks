import { bp } from './core.ts';
import type { State, Town } from './types.ts';

export type Season = 'spring' | 'summer' | 'autumn' | 'winter';
const SEASONS: Season[] = ['spring', 'summer', 'autumn', 'winter'];

/** The season now, or null with seasons off. The year opens in spring; each season is a quarter of `year_seconds`. */
export function seasonOf(S: State): Season | null {
  if (!S.seasons) return null;
  const Y = S.content.tuning.seasons.yearSeconds;
  return SEASONS[Math.floor(((S.t % Y) / Y) * 4) % 4];
}

/**
 * Is a settlement's winter store on track, counting `extra` more mouths? From the start of summer to the
 * first frost, the grain, bread and preserved food in its stores must keep pace with the winter's meals and
 * `winter_headroom` more: none at the start of summer, half at its end, all by the frost. Through the winter,
 * what is left must cover what is left of it. Always true without seasons. `spend` counts that much less in store.
 */
export function storesOnTrack(S: State, t: Town, extra = 0, spend = 0): boolean {
  if (!S.seasons) return true;
  const Z = S.content.tuning.seasons, phase = (S.t % Z.yearSeconds) / Z.yearSeconds;
  // (`spend`: that much less in store, as when a founding party takes its provisions)
  let stored = -spend, pop = extra;
  for (const b of S.buildings) if (b.town === t.id && bp(S, b).storage && !b.site) for (const g of ['wheat', 'bread', ...Z.preserved]) stored += b.inv[g] || 0;
  for (const a of S.agents) if (a.kind === 'villager' && a.home?.town === t.id) pop++;
  const meals = (seconds: number) => (pop * seconds) / S.content.tuning.needs.eatEverySeconds;
  if (phase >= 0.75) return stored >= meals((1 - phase) * Z.yearSeconds);
  return stored >= meals(Z.yearSeconds / 4) * Z.winterHeadroom * Math.max(0, (phase - 0.25) / 0.5);
}
