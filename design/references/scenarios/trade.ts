/**
 * Gate 13 scenario: two self-planning settlements on the standard map, run twice from the same seed: once
 * trading, once each on its own. No build calls. Passes when trade pays: more people in all, nobody fed
 * worse, and each settlement sends away a real share of something it makes.
 */
import { start, worldOf, type Scenario } from '../../../src/gates/kit.ts';
import { runFor, villagers } from '../../../src/sim/index.ts';

export const run: Scenario = (content, params) => {
  const { seed, seconds } = params;
  const go = (trade: boolean) => {
    const S = start(content, seed, { planner: true, settlements: 2, trade, ...worldOf(params) });
    const fed = S.towns.map(() => 1);
    for (let t = 0; t < seconds; t++) { runFor(S, 1); if (S.t > 300) S.towns.forEach((w, i) => { fed[i] = Math.min(fed[i], w.fed); }); }
    const pop = S.towns.map(w => villagers(S).filter(a => a.home?.town === w.id).length);
    return { S, fed, pop: pop.reduce((s, k) => s + k, 0) };
  };
  const alone = go(false), trading = go(true), S = trading.S;
  // each settlement's best export: the share of a good it made (at least `load` of it) that went to a neighbour
  const share = S.towns.map(w => Math.max(0, ...Object.keys(w.trade.exported).filter(g => (w.trade.made[g] || 0) >= content.tuning.trade.load).map(g => w.trade.exported[g] / w.trade.made[g])));
  const r = (v: number) => Math.round(v * 1000) / 1000;
  return {
    state: S,
    metrics: {
      game_seconds: Math.round(S.t),
      settlements: S.towns.length,
      villagers_alone: alone.pop,
      villagers_trading: trading.pop,
      population_gain: r(trading.pop / Math.max(1, alone.pop)),
      fed_min_alone: r(Math.min(...alone.fed)),
      fed_min_trading: r(Math.min(...trading.fed)),
      fed_drop: r(Math.max(...alone.fed.map((f, i) => f - trading.fed[i]))),
      trades: S.stats.trades,
      export_share_min: r(Math.min(...share)),
      departures: S.stats.departures,
    },
  };
};
