/**
 * Gate 10 scenario: the steward's levers, each in a paired run, and the chronicle. No build calls.
 *
 * Zoning: two planning settlements; a farm zone painted beside the first one's storage yard, on the side away
 * from its neighbour, before the
 * game starts. Share of that settlement's farms standing wholly in the zone after `seconds`.
 * Priority: one settlement, run twice for `priority_seconds`, with the priority of logs normal and `First`.
 * How much earlier the raised run first plans for logs.
 * Encouragement: one settlement on each of six internal seeds, run twice for `encourage_seconds`, without
 * and with the Courier Depot encouraged. Seeds where the encouraged run comes up with it sooner.
 * Chronicle: in the zoning run, every invention, teaching and forgetting has its line.
 */
import { standardMetrics, start, worldOf, type Scenario } from '../../../src/gates/kit.ts';
import { runFor, ZONES } from '../../../src/sim/index.ts';

export const run: Scenario = (content, params) => {
  const { seed, seconds } = params;
  const world = worldOf(params), prioritySeconds = Number(params.priority_seconds), encourageSeconds = Number(params.encourage_seconds);

  // zoning
  const S = start(content, seed, { planner: true, settlements: 2, ...world }), w = S.world, st = S.bmap.get(S.towns[0].store)!;
  const farm = 1 + ZONES.indexOf('farms');
  // painted on the side away from the neighbour, as a player would: a zone belongs to the nearest settlement
  const east = (S.bmap.get(S.towns[1]?.store ?? -1)?.x ?? 0) < st.x, x0 = east ? st.x + 7 : st.x - 28;
  for (let y = st.y - 14; y <= st.y + 14; y++) for (let x = x0; x <= x0 + 23; x++) if (x >= 0 && y >= 0 && x < w.w && y < w.h) w.zone[y * w.w + x] = farm;
  runFor(S, seconds);
  const farms = S.buildings.filter(b => b.type === 'farm' && b.town === 0);
  const inZone = farms.filter(b => { for (let j = b.y; j < b.y + b.h; j++) for (let k = b.x; k < b.x + b.w; k++) if (w.zone[j * w.w + k] !== farm) return false; return true; });
  const lines = (k: string) => S.chronicle.filter(c => c.kind === k).length;
  const missing = Math.abs(lines('invented') - S.stats.invented) + Math.abs(lines('taught') - S.stats.taught) + Math.abs(lines('forgotten') - S.stats.forgotten);

  // priority
  const firstLogs = (p: number) => { const T = start(content, seed, { planner: true, ...world }); T.towns[0].levers.priority.logs = p; runFor(T, prioritySeconds); return T.towns[0].planner.firstFor.logs ?? prioritySeconds; };
  const gain = firstLogs(1) - firstLogs(4);

  // encouragement
  let wins = 0;
  for (const sd of [seed, 7, 42, 99, 2026, 31337]) {
    const invented = (back: boolean) => { const T = start(content, sd, { planner: true, ...world }); if (back) T.towns[0].levers.encourage = 'depot'; runFor(T, encourageSeconds); return T.chronicle.find(c => c.kind === 'invented')?.t ?? Infinity; };
    if (invented(true) < invented(false)) wins++;
  }

  return {
    state: S,
    metrics: standardMetrics(S, {
      farms_planned: farms.length,
      zone_share: farms.length ? Math.round((inZone.length / farms.length) * 1000) / 1000 : 0,
      priority_gain_seconds: Math.round(gain),
      encourage_wins: wins,
      chronicle_lines: S.chronicle.length,
      chronicle_missing: missing,
    }),
  };
};
