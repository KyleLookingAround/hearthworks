/**
 * Gate 0 scenario: the default new game exactly as the new-game screen starts it (the gate kit's `newGame`, which
 * `npm run fingerprint` runs too: the first map type at the game size with its settlements, every option on),
 * left to itself for `seconds`. No build calls, no levers. Watched each game second after a warm-up: the lowest
 * share fed of the world and of any one settlement with people. At the end: who starved, how far the world grew
 * (villagers and settlements), trades, the highest age reached, and how many left.
 */
import { newGame, standardMetrics, round, type Scenario } from '../../../src/gates/kit.ts';
import { runFor, villagers } from '../../../src/sim/index.ts';

export const run: Scenario = (content, params) => {
  const { seed, seconds } = params;
  const S = newGame(content, seed);
  const warmup = Number(params.warmup), towns0 = S.towns.length, people0 = villagers(S).length;
  let fedMin = 1, townFedMin = 1, last = -1;
  runFor(S, seconds, s => {
    if (s.t < warmup || Math.floor(s.t) === last) return;
    last = Math.floor(s.t);
    fedMin = Math.min(fedMin, s.fed);
    // settlements with people at home: a party still on its way has nobody to feed
    const housed = new Set(s.buildings.filter(b => b.residents.length).map(b => b.town));
    s.towns.forEach((t, i) => { if (housed.has(i)) townFedMin = Math.min(townFedMin, t.fed); });
  });
  const people = villagers(S).length;
  return {
    state: S,
    metrics: standardMetrics(S, {
      fed_min: round(fedMin),
      town_fed_min: round(townFedMin),
      starved: S.stats.starved,
      villagers_start: people0,
      villagers_grown: people - people0,
      settlements_start: towns0,
      settlements_founded: S.towns.length - towns0,
      trades: S.stats.trades,
      top_age: Math.max(...S.towns.map(t => t.age)),
      births: S.stats.births,
      departures_share: round(S.stats.departures / Math.max(1, S.stats.peakVillagers)),
    }),
  };
};
