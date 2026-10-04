/**
 * Gate 14 scenario, in two parts. Growth: one self-planning settlement on the standard map with people on
 * and newcomers off, so it grows by births alone. Customs: two self-planning settlements whose founding
 * generation is old (scripted: each founder dies between `old_from` and `old_to` seconds in), so every
 * settlement has its dead to honour within the hour. Feasts: two self-planning settlements with people and seasons
 * on, three years: each holds the feasts it keeps as their seasons come. No build calls.
 */
import { start, worldOf, type Scenario } from '../../../src/gates/kit.ts';
import { bp, rand, runFor, villagers } from '../../../src/sim/index.ts';

export const run: Scenario = (content, params) => {
  const { seed, seconds } = params;
  const oldFrom = Number(params.old_from ?? 600), oldTo = Number(params.old_to ?? 2400);
  const r = (v: number) => Math.round(v * 1000) / 1000;

  // growth by births alone
  const G = start(content, seed, { planner: true, people: true, newcomers: false, ...worldOf(params) });
  const founders = villagers(G).length;
  let fedMin = 1;
  for (let t = 0; t < seconds; t++) { runFor(G, 1); if (G.t > 300) fedMin = Math.min(fedMin, G.fed); }
  // every kind of workplace standing at the end has someone at least `expert_at` in it
  const trades = [...new Set(G.buildings.filter(b => !b.site && bp(G, b).workers).map(b => b.type))];
  const experts = trades.filter(k => villagers(G).some(a => (a.skill[k] || 0) >= content.tuning.people.expertAt)).length;

  // customs, with an old founding generation
  const S = start(content, seed, { planner: true, people: true, settlements: 2, ...worldOf(params) });
  const first = S.towns.map(t => t.custom);
  for (const a of villagers(S)) a.dies = (S.t - a.born) + oldFrom + rand(S.prng) * (oldTo - oldFrom);
  for (let t = 0; t < seconds; t++) runFor(S, 1);
  const late = S.towns.reduce((n, t) => n + t.rites.filter(d => S.t - d > content.tuning.people.riteGraceSeconds * 5).length, 0);

  // feasts, with the year turning: how many each settlement held, and what each kept first and at the end
  const F = start(content, seed, { planner: true, people: true, seasons: true, settlements: 2, ...worldOf(params) });
  const feastsFirst = F.towns.map(t => t.feasts.join('+'));
  for (let t = 0; t < seconds; t++) runFor(F, 1);
  const held = F.towns.map(t => F.chronicle.filter(c => c.town === t.id && c.kind === 'feast' && c.text.includes(' held its ')).length);
  const years = Math.floor(F.t / content.tuning.seasons.yearSeconds);

  return {
    state: S,
    metrics: {
      game_seconds: Math.round(G.t),
      founders,
      villagers_end: villagers(G).length,
      growth: r(villagers(G).length / Math.max(1, founders)),
      births: G.stats.births,
      fed_min: r(fedMin),
      trades: trades.length,
      expert_share: r(trades.length ? experts / trades.length : 0),
      customs_first: first.join(' '),
      customs_end: S.towns.map(t => t.custom).join(' '),
      customs_distinct: new Set(S.towns.map(t => t.custom)).size,
      deaths: S.stats.deaths,
      honoured: S.stats.honoured,
      rite_wait_max: Math.round(S.stats.riteWaitMax),
      unhonoured_late: late,
      feasts_first: feastsFirst.join(' '),
      feasts_end: F.towns.map(t => t.feasts.join('+')).join(' '),
      feasts_held: F.stats.feasts,
      feasts_missed: F.stats.feastsMissed,
      feasts_per_year_min: r(Math.min(...held) / Math.max(1, years)),
      feast_kinds: new Set(F.towns.flatMap(t => t.feasts)).size,
    } as unknown as Record<string, number>,
  };
};
