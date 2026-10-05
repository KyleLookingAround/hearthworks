/**
 * Gate 15 scenario: four paired parts on the standard map, and a new game left to itself.
 * Library: one settlement is taught the Courier Depot by a neighbour (scripted) and never builds one; run
 * for `keep_seconds`, once with a library standing and once without. Kept with, lost without.
 * University: one self-planning settlement with people on, on each of six internal seeds, run for
 * `inquiry_seconds` without and with a university (scripted, with its scholar found like any worker).
 * Seeds where the first invention comes sooner with the university.
 * Needs a university: one self-planning settlement with people and hardship on that knows the Healer's House
 * (scripted) and is kept fresh from sickness (scripted), run for `inquiry_seconds` with a university standing and
 * without one (kept from knowing the university, scripted, so it cannot build its own): the Bathhouse, a discovery that needs a university, is thought of with one and never without.
 * Scholars, unscripted: a new game with every system on (`scholars_map` at `scholars_size`, `scholars_settlements`),
 * nothing scripted, for `scholars_seconds`: its planners raise universities, and their scholars think of ideas only a
 * university finds; no settlement without a university at work thinks of one.
 * Reading: two settlements, each with a library (scripted); the second knows the Courier Depot. With a grown
 * villager of the first schooled to read (scripted) and visits held back, the first reads the Depot off the
 * second's shelves within `copy_every_seconds`; with nobody schooled it does not read it. And a worker schooled
 * to read, with no master of the trade in the settlement, learns it from a library at least twice as fast as without.
 */
import { centre, findSpot, start, worldOf, type Scenario } from '../../../src/gates/kit.ts';
import { learningAt, placeBuilding, runFor, villagers, type State } from '../../../src/sim/index.ts';

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
    // without: the settlement never comes to know the university either, so it cannot build its own (scripted)
    for (let s = 0; s < inquirySeconds; s++) { t.struck.sickness = T.t; runFor(T, 1, () => { if (!university) delete t.knows.university; }); if (at < 0 && 'bathhouse' in t.knows) at = T.t; }
    return { known: at >= 0 ? 1 : 0, at, built: T.buildings.filter(b => b.town === t.id && content.blueprints[b.type].sanitation).length };
  };
  const withUni = scholars(true), withoutUni = scholars(false);

  // reading from a library without a visitor
  const reads = (reader: boolean) => {
    const T = start(content, seed, { people: true, settlements: 2, ...world });
    const [a, b] = T.towns;
    b.knows.depot = { by: b.name, at: 0, verified: [], from: null, learned: 0, used: 0 };
    for (const t of [a, b]) { const y = T.bmap.get(t.store)!, at = findSpot(T, 'library', { x: y.x, y: y.y }, 30)!; placeBuilding(T, 'library', at.x, at.y, true)!.town = t.id; }
    if (reader) villagers(T).find(v => v.home?.town === a.id)!.schooled = true;
    runFor(T, content.tuning.knowledge.copyEverySeconds + 2, s => { for (const t of s.towns) t.visitT = 0; });
    return T.chronicle.some(c => c.town === a.id && c.kind === 'taught' && c.text.startsWith(`Readers in ${a.name}`)) ? 1 : 0;
  };
  const trade = (library: boolean) => {
    const T = start(content, seed, { people: true, ...world });
    if (library) stand(T, 'library');
    const farm = stand(T, 'farm');
    runFor(T, 2);
    const w = villagers(T).find(v => v.work === farm) ?? villagers(T).find(v => v.role === 'worker' && v.work)!;
    w.schooled = true;
    // nobody else in the settlement knows any trade: no master to learn from
    runFor(T, 30, () => { for (const v of villagers(T)) if (v !== w) v.skill = {}; w.skill = w.skill[w.work!.type] ? { [w.work!.type]: w.skill[w.work!.type] } : {}; });
    return w.skill[w.work!.type] || 0;
  };
  const shelved = trade(true), bare = trade(false);

  // scholars, unscripted: a new game with every system on, nothing scripted. Its planners raise universities, and their
  // scholars think of ideas only a university finds; nobody without one at work does.
  const scholarsWorld = () => {
    const size = String(params.scholars_size), T = start(content, seed, { planner: true, seasons: true, trade: true, people: true, carts: true, settlers: true, charts: true, hardship: true, plannedRoads: true, farms: true, settlements: Number(params.scholars_settlements), map: String(params.scholars_map), size });
    const only = Object.values(content.blueprints).filter(B => B.discovery?.university);
    let ideas = 0, without = 0, first = -1, seen = 0;
    runFor(T, Number(params.scholars_seconds), s => {
      for (; seen < s.chronicle.length; seen++) {
        const c = s.chronicle[seen];
        if (c.kind !== 'invented' || !only.some(B => c.text.includes(`came up with the ${B.name}`))) continue;
        if (learningAt(s, c.town, 'university')) { ideas++; if (first < 0) first = s.t; } else without++;
      }
    });
    return { ideas, without, first, universities: T.buildings.filter(b => !b.site && content.blueprints[b.type].learning === 'university').length };
  };
  const scholarsRun = scholarsWorld();

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
      read_with_readers: reads(true),
      read_without_readers: reads(false),
      reader_skill_ratio: Math.round((shelved / Math.max(1e-9, bare)) * 100) / 100,
      universities_unscripted: scholarsRun.universities,
      scholars_ideas: scholarsRun.ideas,
      scholars_first_idea_at: Math.round(scholarsRun.first),
      ideas_without_scholars: scholarsRun.without,
    },
  };
};
