/**
 * Gate 15 scenario, three paired parts on the standard map.
 * Library: one settlement is taught the Courier Depot by a neighbour (scripted) and never builds one; run
 * for `keep_seconds`, once with a library standing and once without. Kept with, lost without.
 * University: one self-planning settlement with people on, on each of six internal seeds, run for
 * `inquiry_seconds` without and with a university (scripted, with its scholar found like any worker).
 * Seeds where the first invention comes sooner with the university.
 * Needs a university: one self-planning settlement with people and hardship on that knows the Healer's House
 * (scripted) and is kept fresh from sickness (scripted), run for `inquiry_seconds` with a university standing and
 * without: the Bathhouse, a discovery that needs a university, is thought of with one and never without.
 */
import { centre, findSpot, start, worldOf, type Scenario } from '../../../src/gates/kit.ts';
import { placeBuilding, runFor, type State } from '../../../src/sim/index.ts';

/** A building already standing near the storage yard. */
const stand = (S: State, type: string) => { const at = findSpot(S, type, centre(S), 30); if (!at) throw new Error(`no room for ${type}`); return placeBuilding(S, type, at.x, at.y, true)!; };

export const run: Scenario = (content, params) => {
  const { seed } = params, world = worldOf(params);
  const keepSeconds = Number(params.keep_seconds), inquirySeconds = Number(params.inquiry_seconds);

  const keeps = (library: boolean) => {
    const S = start(content, seed, { ...world });
    const t = S.towns[0];
    t.knows.depot = { by: 'Brook', at: 0, verified: [{ by: 'Brook', at: 0 }], from: 'Brook', learned: 0, used: 0 };
    if (library) stand(S, 'library');
    runFor(S, keepSeconds);
    return { S, kept: 'depot' in t.knows ? 1 : 0 };
  };
  const withLib = keeps(true), without = keeps(false);

  let wins = 0;
  for (const sd of [seed, 7, 42, 99, 2026, 31337]) {
    const first = (university: boolean) => {
      const T = start(content, sd, { planner: true, people: true, ...world });
      if (university) stand(T, 'university');
      runFor(T, inquirySeconds);
      return T.chronicle.find(c => c.kind === 'invented')?.t ?? Infinity;
    };
    if (first(true) < first(false)) wins++;
  }

  // a discovery that needs a university: thought of with one at work, never without
  const scholars = (university: boolean) => {
    const T = start(content, seed, { planner: true, people: true, hardship: true, ...world });
    const t = T.towns[0];
    t.knows.healer = { by: 'Brook', at: 0, verified: [{ by: 'Brook', at: 0 }], from: 'Brook', learned: 0, used: 0 };
    if (university) stand(T, 'university');
    let at = -1;
    for (let s = 0; s < inquirySeconds; s++) { t.struck.sickness = T.t; runFor(T, 1); if (at < 0 && 'bathhouse' in t.knows) at = T.t; }
    return { known: at >= 0 ? 1 : 0, at, built: T.buildings.filter(b => b.town === t.id && content.blueprints[b.type].sanitation).length };
  };
  const withUni = scholars(true), withoutUni = scholars(false);

  return {
    state: withLib.S,
    metrics: {
      game_seconds: Math.round(withLib.S.t),
      kept_with_library: withLib.kept,
      kept_without_library: without.kept,
      university_wins: wins,
      needs_university_with: withUni.known,
      needs_university_with_at: Math.round(withUni.at),
      needs_university_without: withoutUni.known,
      bathhouses_with: withUni.built,
    },
  };
};
