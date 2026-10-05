/**
 * Gate 13 scenario: two self-planning settlements on the standard map, run each on its own and trading, from the
 * same seed. No build calls. Passes when trade pays: more people in all, nobody fed worse, and each settlement sends
 * away a real share of something it makes. A village's fortunes turn on chance as much as on trade (one draw more
 * of luck at the start moves an hour's population by a tenth either way), so each side is run `runs` times, the
 * world the same and the luck drawn afresh, and population is weighed over them all.
 */
import { start, worldOf, type Scenario } from '../../../src/gates/kit.ts';
import { rand, runFor, villagers } from '../../../src/sim/index.ts';

export const run: Scenario = (content, params) => {
  const { seed, seconds } = params, runs = Math.max(1, Number(params.runs ?? 1));
  // the k-th run draws k times from the world's luck before it starts: the same land, another turn of fortune
  const go = (trade: boolean, k: number) => {
    const S = start(content, seed, { planner: true, settlements: 2, trade, ...worldOf(params) });
    for (let i = 0; i < k; i++) rand(S.rng);
    const fed = S.towns.map(() => 1);
    for (let t = 0; t < seconds; t++) { runFor(S, 1); if (S.t > 300) S.towns.forEach((w, i) => { fed[i] = Math.min(fed[i], w.fed); }); }
    const pop = S.towns.map(w => villagers(S).filter(a => a.home?.town === w.id).length);
    return { S, fed, pop: pop.reduce((s, k) => s + k, 0) };
  };
  const alone: ReturnType<typeof go>[] = [], trading: ReturnType<typeof go>[] = [];
  for (let k = 0; k < runs; k++) { alone.push(go(false, k)); trading.push(go(true, k)); }
  // volume, specialisation and departures from the first run, as before; population and being fed over every run
  const S = trading[0].S;
  // each settlement's best export: the share of a good it made (at least `load` of it) that went to a neighbour
  const share = S.towns.map(w => Math.max(0, ...Object.keys(w.trade.exported).filter(g => (w.trade.made[g] || 0) >= content.tuning.trade.load).map(g => w.trade.exported[g] / w.trade.made[g])));
  const r = (v: number) => Math.round(v * 1000) / 1000, sum = (xs: { pop: number }[]) => xs.reduce((s, x) => s + x.pop, 0);
  const minFed = (xs: { fed: number[] }[]) => Math.min(...xs.flatMap(x => x.fed));
  return {
    state: S,
    metrics: {
      game_seconds: Math.round(S.t),
      settlements: S.towns.length,
      runs,
      villagers_alone: sum(alone),
      villagers_trading: sum(trading),
      population_gain: r(sum(trading) / Math.max(1, sum(alone))),
      population_gain_first: r(trading[0].pop / Math.max(1, alone[0].pop)),
      fed_min_alone: r(minFed(alone)),
      fed_min_trading: r(minFed(trading)),
      fed_drop: r(Math.max(...alone[0].fed.map((f, i) => f - trading[0].fed[i]))),
      trades: S.stats.trades,
      export_share_min: r(Math.min(...share)),
      departures: S.stats.departures,
    },
  };
};
