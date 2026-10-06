/**
 * The village planner. Every `interval_seconds` it looks at the town, finds
 * the worst shortage, picks the blueprint that relieves it best for its cost,
 * chooses a site and posts it to the job board like any other building.
 *
 * Nothing here names a building type: what a blueprint relieves is read from
 * its recipe, homes and harvest fields, so new blueprints in design/ join in.
 * Deterministic: no randomness at all, ties break by scan order.
 */
import { bp, chronicle, emit } from './core.ts';
import { placeBridge, placeBuilding } from './buildings.ts';
import { planRoads } from './roads.ts';
import { planBelts } from './belts.ts';
import { growFarm, sizeName, toGrow } from './farms.ts';
import type { State, Town } from './types.ts';
import { goodName, runningLow, article } from './planner/text.ts';
import { T, known, starved, formOf, homeFor, hubs, affordable } from './planner/core.ts';
import { type Shortage, look, importFrom } from './planner/sense.ts';
import { type Choice, propose, follow } from './planner/choose.ts';
import { chooseSpot, centreSpot, alongRoad } from './planner/site.ts';
import { clearFor, clearShore, chooseBridge } from './planner/water.ts';
import { replan, finishMoves, renew } from './planner/renewal.ts';
import { foundDistrict, layStreets, pave } from './planner/districts.ts';

// the planner's parts, each in src/sim/planner/, and what this module has always exported
export { sealsOff } from './place.ts';
export { formOf, hubs, centreOf } from './planner/core.ts';
export { look, importFrom, shortOfFood } from './planner/sense.ts';
export { chooseSpot } from './planner/site.ts';
export { clearShore } from './planner/water.ts';
export { renewalNote } from './planner/renewal.ts';

/** The settlement's own sites still being built: those its planner placed (with a reason), not the player's. */
export const openSites = (S: State, town: Town) => S.buildings.filter(b => b.town === town.id && b.site && b.reason).length;

/**
 * How many of its own sites a settlement keeps open at once: one, and with its town hall's planner at their desk
 * `hall_sites` more, and `hall_master_sites` more again from a planner whose skill has reached `expert_at`.
 */
export function atOnce(S: State, town: Town): number {
  const P = T(S);
  for (const b of S.buildings) {
    if (b.town !== town.id || b.site || !bp(S, b).hall || b.worker === null) continue;
    const w = S.amap.get(b.worker);
    if (!w || w.state !== 'working') continue;
    return 1 + P.hallSites + ((w.skill[b.type] || 0) >= S.content.tuning.people.expertAt ? P.hallMasterSites : 0);
  }
  return 1;
}

/** Advance every settlement's planner by dt. Called from tick(). */
export function plan(S: State, dt: number) {
  for (const town of S.towns) planTown(S, town, dt);
}

function planTown(S: State, town: Town, dt: number) {
  const Q = town.planner;
  if (!Q.on) return;
  Q.t -= dt;
  if (Q.t > 0) return;
  Q.t += T(S).intervalSeconds / town.levers.pace;
  if (Q.roads) pave(S, town);
  if (formOf(S, town) === 'town') layStreets(S, town);
  // a village or town that knows the road lays one now and then
  if (planRoads(S, town, T(S).intervalSeconds / town.levers.pace)) return;
  // and one that knows the conveyor lays a belt from a storage yard's door now and then
  if (planBelts(S, town, T(S).intervalSeconds / town.levers.pace)) return;

  // a building moved out of a centre is finished: the old one comes down
  finishMoves(S, town);
  const mine = Q.site !== null ? S.bmap.get(Q.site) : undefined;
  // a site waits its turn, unless it has waited `site_patience_seconds` for a good nobody has: then plan around it;
  // with a planner at their desk in the town hall, it plans on while fewer than `atOnce` of its own sites are open
  const open = mine?.site && !starved(S, mine, town);
  if (open && openSites(S, town) >= atOnce(S, town)) { Q.status = bp(S, mine).field ? `Laying new fields ${mine.reason}` : `Building ${article(bp(S, mine).name)} ${bp(S, mine).name}: ${mine.reason}`; return; }
  if (Q.site !== null && !open) { Q.site = null; Q.settle = T(S).settleSeconds / town.levers.pace; }
  if (Q.settle > 0) { Q.settle -= T(S).intervalSeconds / town.levers.pace; return; }

  // the worst shortage something known can relieve
  const L = look(S, town), worst = L.shortages[0];
  // what it is short of, for its porters to trade for: its shortages of goods, and what it is saving
  Q.wants = {}; Q.use = { ...L.demand };
  for (const sh of L.shortages) if (sh.good && sh.sev >= T(S).minSeverity) Q.wants[sh.good] = sh.sev;
  if (Q.saving) Q.wants[Q.saving.good] = Math.max(Q.wants[Q.saving.good] || 0, T(S).savingWant);
  // a crowded newest district splits off a new one
  if (formOf(S, town) !== 'hamlet' && foundDistrict(S, town)) return;
  // a village or town looks over what it has built: what no longer pays comes down, land and noise move out of the centres
  if (renew(S, town, L)) return;
  // a village or town with beds to spare renews an old block now and then: sparse homes make way for its densest
  const dense = homeFor(S, town), form = formOf(S, town);
  if (dense && form !== 'hamlet' && S.t - Q.replanAt >= T(S).replanEverySeconds && L.freeBeds > 0
    && replan(S, town, { B: dense, sev: T(S).minSeverity, why: `the ${form} is renewing its old streets` })) { Q.replanAt = S.t; return; }
  Q.want = null;
  if (!worst || worst.sev < T(S).minSeverity) { Q.streak = { type: '', n: 0 }; Q.status = `The ${formOf(S, town)} has what it needs`; return; }
  // something it recently found no room for waits `no_room_retry_seconds`; the next need goes ahead
  const roomless = (id: string) => id in Q.noRoom && S.t - Q.noRoom[id] < T(S).noRoomRetrySeconds;
  // what waits for hands to work it doesn't hold back the next need: the next that can go ahead does
  let c: Choice | null = null, blocked: Choice | null = null, waiting: Choice | null = null, trading: Shortage | null = null;
  for (const sh of L.shortages) {
    if (sh.sev < T(S).minSeverity) break;
    // what it trades for from a neighbour that makes it, it does not make
    if (sh.from) { trading ??= sh; continue; }
    c = propose(S, L, sh);
    // a university is wanted, not needed: with no room for one, the next need goes ahead in the same look, and the
    // planner does not say the land is full (which would send settlers off)
    // (with no room it clears a workshop resting with enough in store, as a dock clears the shore)
    if (c && c.B.learning === 'university' && (roomless(c.B.id) || (!hubs(S, town).some(h => chooseSpot(S, c!.B.id, town, false, h)) && !chooseSpot(S, c.B.id, town) && !clearFor(S, town, c.B)))) { if (!roomless(c.B.id)) Q.noRoom[c.B.id] = S.t; c = null; continue; }
    if (c && roomless(c.B.id)) { blocked ??= c; c = null; continue; }
    if (c?.wait) { waiting ??= c; c = null; continue; }
    // short of a good whose maker it has just found no room for: saving would wait for good, so the next need goes ahead
    const owe = c ? affordable(S, c.B, town) : null, maker = owe ? known(S, town).find(B => B.seconds && B.output[owe.good]) : undefined;
    if (c && maker && roomless(maker.id) && (L.supply[owe!.good] || 0) <= 0) { blocked ??= { ...c, B: maker }; c = null; continue; }
    if (c) break;
  }
  if (!c && waiting) { Q.streak = { type: '', n: 0 }; Q.status = waiting.wait!; return; }
  if (!c && blocked) { Q.status = `No room for ${article(blocked.B.name)} ${blocked.B.name}: ${blocked.why}`; return; }
  if (!c && trading) { Q.streak = { type: '', n: 0 }; Q.status = `Trading with ${trading.from!.name} for ${goodName(S, trading.good!)}: ${trading.why}`; return; }
  if (!c) { Q.status = `Nothing the ${formOf(S, town)} knows would help: ${worst.why}`; return; }

  // what the village is working towards counts as use: it is not forgotten while saved for
  Q.want = c.B.id;
  // can't pay for it: if nothing makes the missing good, or the village has already been short of it
  // for longer than `save_patience_seconds`, whatever it was saving for, make more of it first
  const owe = affordable(S, c.B, town);
  if (owe) {
    if (Q.saving?.good !== owe.good) Q.saving = { good: owe.good, since: S.t };
    // (a good it trades for from a neighbour that makes it is waited for, not made)
    const from = importFrom(S, town, owe.good, L.demand[owe.good] || 0);
    const stuck = !from && ((L.supply[owe.good] || 0) <= 0 || S.t - Q.saving.since > T(S).savePatienceSeconds);
    const maker = stuck ? known(S, town).find(B => B.seconds && B.output[owe.good]) : undefined;
    if (maker) Q.saving.since = S.t;
    const why = `${runningLow(S, owe.good)} to build ${article(c.B.name)} ${c.B.name}`;
    if (maker && !affordable(S, maker, town)) c = follow(S, L, { B: maker, sev: c.sev, why }, 0);
    else { Q.status = from ? `Trading with ${from.name} for ${goodName(S, owe.good)} to build ${article(c.B.name)} ${c.B.name}: ${c.why}` : `Saving ${goodName(S, owe.good)} for ${article(c.B.name)} ${c.B.name}: ${c.why}`; return; }
    // a maker that would only stand beside others short of its own input waits too (seven masons, and no stone)
    if (c.lacks) { Q.streak = { type: '', n: 0 }; Q.status = c.wait!; return; }
    // what the maker led to (an input's maker, a home for its worker) must be affordable as well;
    // if it is not, build the maker itself: its inputs can follow, but nothing comes without it
    if (affordable(S, c.B, town)) c = { B: maker, sev: c.sev, why };
  }

  if (!owe) Q.saving = null;
  Q.streak = Q.streak.type === c.B.id ? { type: c.B.id, n: Q.streak.n + 1 } : { type: c.B.id, n: 1 };
  if (Q.streak.n < T(S).confirmCycles) { Q.status = `Thinking about ${article(c.B.name)} ${c.B.name}: ${c.why}`; return; }

  // a farm that can grow grows instead: new fields behind it, and a place for one more hand
  const grow = S.farms && c.B.grows ? toGrow(S, town, c.B) : null, fields = grow ? growFarm(S, grow, true) : null;
  if (grow && fields) {
    fields.priority = 1 + Math.round(c.sev * T(S).urgencyPriority);
    fields.reason = `${fields.reason}: ${c.why}`;
    Q.site = fields.id; Q.placed++; Q.streak = { type: '', n: 0 };
    delete Q.noRoom[c.B.id];
    if (c.key && !(c.key in Q.firstFor)) Q.firstFor[c.key] = S.t;
    const name = sizeName(S, grow);
    Q.status = `Growing ${article(name)} ${name.toLowerCase()}: ${c.why}`;
    emit(S, 'info', S.towns.length > 1 ? `${town.name}: ${Q.status}` : Q.status, true);
    return;
  }
  if (c.B.bridge) {
    const span = chooseBridge(S, c.B, town);
    if (!span) { Q.noRoom[c.B.id] = S.t; Q.streak = { type: '', n: 0 }; Q.status = `No place for ${article(c.B.name)} ${c.B.name}: ${c.why}`; return; }
    delete Q.noRoom[c.B.id];
    const b = placeBridge(S, span.x, span.y, span.w, span.h, span.from, span.to, town.id);
    b.priority = 1 + Math.round(c.sev * T(S).urgencyPriority);
    b.reason = c.why;
    Q.site = b.id; Q.placed++; Q.streak = { type: '', n: 0 };
    if (c.key && !(c.key in Q.firstFor)) Q.firstFor[c.key] = S.t;
    chronicle(S, town.id, 'bridge', `${town.name} planned a bridge: ${c.why}`);
    Q.status = `Planning ${article(c.B.name)} ${c.B.name}: ${c.why}`;
    emit(S, 'info', S.towns.length > 1 ? `${town.name}: ${Q.status}` : Q.status, true);
    return;
  }
  // in a village or town, homes go first onto open land in the district centres, where workplaces moved out or came down
  // (once it has laid roads, only along one: a home off the roads goes where the planner would put it anyway)
  let spot = c.B.homes && formOf(S, town) !== 'hamlet' ? centreSpot(S, c.B.id, town) : null;
  if (spot && S.world.roads > 0 && !alongRoad(S, c.B, spot)) spot = null;
  spot ??= chooseSpot(S, c.B.id, town);
  // a dock looks along the shores of every district, newest first
  // (and a university, where a workshop was cleared for it)
  if (c.B.shore || c.B.learning === 'university') for (const h of hubs(S, town).reverse()) spot ??= chooseSpot(S, c.B.id, town, false, h);
  // a dock with no shore left clears one: a workshop on the shore comes down for it, as roads clear their line
  if (!spot && c.B.shore) {
    const cleared = clearShore(S, town, c.B);
    if (cleared) {
      spot = cleared.spot;
      chronicle(S, town.id, 'dock', `${town.name} cleared ${article(bp(S, cleared.cut).name)} ${bp(S, cleared.cut).name.toLowerCase()} from its shore for a dock`);
    }
  }
  if (!spot) { Q.noRoom[c.B.id] = S.t; Q.streak = { type: '', n: 0 }; Q.status = `No room for ${article(c.B.name)} ${c.B.name}: ${c.why}`; return; }
  delete Q.noRoom[c.B.id];
  const b = placeBuilding(S, c.B.id, spot.x, spot.y, false, spot.rot)!;
  b.town = town.id;
  b.priority = 1 + Math.round(c.sev * T(S).urgencyPriority);
  b.reason = c.why;
  Q.site = b.id; Q.placed++; Q.streak = { type: '', n: 0 };
  if (c.key && !(c.key in Q.firstFor)) Q.firstFor[c.key] = S.t;
  Q.status = `Planning ${article(c.B.name)} ${c.B.name}: ${c.why}`;
  emit(S, 'info', S.towns.length > 1 ? `${town.name}: ${Q.status}` : Q.status, true);
}
