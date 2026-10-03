/**
 * Gate 20 scenario, two parts.
 * Hardship: one self-planning settlement on the gate's world with seasons and hardship on, for `seconds`.
 * No build calls. Hazards come of themselves; any kind that has not struck by `strike_at` is brought down
 * once then (the answers stay unscripted). Watched: each kind struck, the people lost to departures and
 * deaths against the most it had, and the kinds of hazard it built a counter for.
 * Lean winter: a planned settlement on the standard map with seasons on is run to the first frost of its
 * second year, its food cut to `lean_share`, and the winter played out twice from there (by save and load):
 * without rationing and with it. How many leave or die each way.
 */
import { start, worldOf, type Scenario } from '../../../src/gates/kit.ts';
import { HAZARDS, bp, loadGame, runFor, saveGame, strike, villagers, type State } from '../../../src/sim/index.ts';

export const run: Scenario = (content, params) => {
  const { seed, seconds } = params, strikeAt = Number(params.strike_at), lean = Number(params.lean_share);
  const S = start(content, seed, { planner: true, seasons: true, hardship: true, ...worldOf(params) });
  const town = S.towns[0];
  let forced = 0, fedMin = 1;
  for (let t = 0; t < seconds; t++) {
    runFor(S, 1);
    if (Math.floor(S.t) === strikeAt) for (const h of HAZARDS) if (!(h in town.struck) && strike(S, town, h)) forced++;
    if (S.t > 300) fedMin = Math.min(fedMin, S.fed);
  }
  const year = content.tuning.seasons.yearSeconds, st = S.stats;
  const countered = HAZARDS.filter(h => S.buildings.some(b => b.town === town.id && !b.site && bp(S, b).guards?.hazard === h)).length;

  // the lean winter, without rationing and with it
  const L = start(content, seed, { planner: true, seasons: true });
  runFor(L, year + year * 3 / 4);
  const food = ['wheat', 'bread', ...content.tuning.seasons.preserved];
  for (const b of L.buildings) for (const g of food) if (b.inv[g]) b.inv[g] = Math.floor(b.inv[g] * lean);
  const frost = saveGame(L);
  const winter = (ration: boolean) => {
    const W: State = loadGame(content, frost);
    W.towns[0].laws.rationing = ration;
    const before = W.stats.departures + W.stats.deaths;
    runFor(W, year / 4);
    return W.stats.departures + W.stats.deaths - before;
  };
  const without = winter(false), withRationing = winter(true);
  const r = (v: number) => Math.round(v * 1000) / 1000;

  return {
    state: S,
    metrics: {
      game_seconds: Math.round(S.t),
      winters: Math.floor(Math.round(S.t) / year),
      villagers: villagers(S).length,
      peak_villagers: st.peakVillagers,
      fires: st.fires, floods: st.floods, outbreaks: st.outbreaks, raids: st.raids,
      struck_by_gate: forced,
      buildings_burnt: st.burnt, raids_repelled: st.repelled, goods_looted: st.looted, sick_deaths: st.sickDeaths,
      departures: st.departures, deaths: st.deaths,
      lost_share: r((st.departures + st.deaths) / Math.max(1, st.peakVillagers)),
      fed_min: r(fedMin),
      countered_kinds: countered,
      camps: S.camps.length,
      lean_villagers: villagers(L).length,
      lean_lost_without: without,
      lean_lost_with: withRationing,
      rationing_saved: without - withRationing,
    },
  };
};
