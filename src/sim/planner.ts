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
import { foodChainOf } from './production.ts';
import { placeBridge, placeBuilding } from './buildings.ts';
import { rested, roadDue, roadWork, take, tendRoads, unpaid, type Works } from './roads.ts';
import { beltDue, beltWork, restBelts, tendBelts } from './belts.ts';
import { growFarm, sizeName, toGrow } from './farms.ts';
import type { BlueprintDef, Building, State, Town, Verdict, Wish } from './types.ts';
import { goodName, runningLow, article } from './planner/text.ts';
import { T, clamp01, known, starved, formOf, homeFor, hubs, affordable, mineOf } from './planner/core.ts';
import { type Look, type Shortage, look, importFrom } from './planner/sense.ts';
import { type Choice, propose, follow } from './planner/choose.ts';
import { chooseSpot, centreSpot, alongRoad } from './planner/site.ts';
import { clearFor, clearShore, chooseBridge } from './planner/water.ts';
import { replan, replanBlock, finishMoves, renew, moveOut, moveOutWish } from './planner/renewal.ts';
import { districtDue, districtSpot, foundDistrict, layStreets, pave } from './planner/districts.ts';

// the planner's parts, each in src/sim/planner/, and what this module has always exported
export { sealsOff } from './place.ts';
export { formOf, hubs, centreOf, crowded } from './planner/core.ts';
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

/** What a candidate on the list does once it goes ahead: places its site (or lays its work) and says so, or finds no room. */
type Act = () => string | null;
/**
 * A candidate on the wish list: a need it sees, or one of the works that once pre-empted the needs (a road, a conveyor,
 * a new district, a replanned block, a workplace moved out of a centre), each at its own weight.
 */
type Cand = { sh: Shortage } | { key: string; sev: number; why: string; B?: BlueprintDef; works?: Works; act?: Act; room?: string };

function planTown(S: State, town: Town, dt: number) {
  const Q = town.planner;
  if (!Q.on) return;
  Q.t -= dt;
  if (Q.t > 0) return;
  const P = T(S), step = P.intervalSeconds / town.levers.pace;
  Q.t += step;
  if (Q.roads) pave(S, town);
  if (formOf(S, town) === 'town') layStreets(S, town);
  // roads and conveyors in use keep their knowledge alive, and the next look for one comes nearer
  tendRoads(S, town, step);
  tendBelts(S, town, step);

  // a building moved out of a centre is finished: the old one comes down
  finishMoves(S, town);
  const mine = Q.site !== null ? S.bmap.get(Q.site) : undefined;
  // a site waits its turn, unless it has waited `site_patience_seconds` for a good nobody has: then plan around it;
  // with a planner at their desk in the town hall, it plans on while fewer than `atOnce` of its own sites are open
  const open = mine?.site && !starved(S, mine, town);
  // with its sites all taken, it still lays a road or a conveyor it has come to (they need no site): the list is made,
  // and only those can go ahead
  const busy = !!open && openSites(S, town) >= atOnce(S, town);
  if (busy && !due(S, town)) return;
  if (Q.site !== null && !open) { Q.site = null; Q.settle = P.settleSeconds / town.levers.pace; }
  if (!busy && Q.settle > 0) { Q.settle -= P.intervalSeconds / town.levers.pace; return; }

  const L = look(S, town);
  // what it is short of, for its porters to trade for: its shortages of goods, and what it is saving
  // (as it found them when it last planned a site: a look for a road alone leaves them be)
  if (!busy) {
    Q.wants = {}; Q.use = { ...L.demand };
    for (const sh of L.shortages) if (sh.good && sh.sev >= P.minSeverity) Q.wants[sh.good] = sh.sev;
    if (Q.saving) Q.wants[Q.saving.good] = Math.max(Q.wants[Q.saving.good] || 0, P.savingWant);
  }
  // a village or town looks over what it has built: what no longer pays comes down (it costs nothing, and the look goes on)
  if (!busy) { renew(S, town, L); Q.want = null; }
  const wishes = wishList(S, town, L, busy);
  // (with its sites all taken and nothing laid, the list it made when it last planned a site stands)
  if (busy && !wishes.length) return;
  Q.wishes = wishes.slice(0, P.wishListSize);
  // the status line is the list's top entry
  Q.status = wishes[0] && wishes[0].verdict !== 'below' ? wishes[0].text : `The ${formOf(S, town)} has what it needs`;
  // no room for a wish it needs (not a university, which is wanted, nor a bridge or a district): its land is full
  // (a look for a road alone, its needs all waiting on its sites, says nothing of its land)
  if (busy) return;
  const full = wishes.some(w => w.verdict === 'room' && w.key !== 'university' && w.key !== 'district' && !S.content.blueprints[w.type ?? '']?.bridge);
  Q.roomSince = full ? Q.roomSince ?? S.t : null;
}

/**
 * The wish list, one look's worth: every need it sees and every work it could take up, most pressing first, each with
 * the building it calls for and its verdict. Goes down the list to the first that can go ahead (confirmed over
 * `confirm_cycles` looks and paid for, or saved for) and acts on it; the list comes back with the wish that decided the
 * look first. Food comes first everywhere: while food is short, every need of the food chain goes before every work.
 * With its sites all taken (`busy`), only a road or a conveyor may go ahead.
 */
function wishList(S: State, town: Town, L: Look, busy: boolean): Wish[] {
  const P = T(S), Q = town.planner, form = formOf(S, town);
  const lever = (k: string) => town.levers.priority[k] ?? 1;
  const weigh = (k: string, w: number) => clamp01(w * lever(k));
  const cands: Cand[] = [];
  // works, each at its weight (and only while it would come to anything: what it costs to look for them is paid only then)
  const works: Cand[] = [];
  if (weigh('road', P.roadWeight) >= P.minSeverity) { const w = roadWork(S, town); if (w) works.push({ key: 'road', sev: weigh('road', P.roadWeight), why: 'its people walk this way most', works: w }); } else rested(town);
  if (weigh('belt', P.beltWeight) >= P.minSeverity) { const w = beltWork(S, town); if (w) works.push({ key: 'belt', sev: weigh('belt', P.beltWeight), why: 'its carriers walk the lanes from a yard', works: w }); } else restBelts(town);
  // a crowded newest district splits off a new one
  if (!busy && form !== 'hamlet' && weigh('district', P.districtWeight) >= P.minSeverity && districtDue(S, town)) {
    const spot = districtSpot(S, town), sev = weigh('district', P.districtWeight);
    works.push({ key: 'district', sev, why: 'the old one has filled up', B: S.content.blueprints.storage, ...(spot ? { act: () => { foundDistrict(S, town, spot, sev); return Q.status; } } : { room: 'No room for a new district: the old one has filled up' }) });
  }
  // a village or town with beds to spare renews an old block now and then: sparse homes make way for its densest
  const dense = homeFor(S, town);
  if (!busy && dense && form !== 'hamlet' && S.t - Q.replanAt >= P.replanEverySeconds && L.freeBeds > 0 && weigh('replan', P.replanWeight) >= P.minSeverity) {
    const block = replanBlock(S, town, dense), sev = weigh('replan', P.replanWeight), why = `the ${form} is renewing its old streets`;
    // (with no block to renew, it looks again in `replan_every_seconds`)
    if (block) works.push({ key: 'replan', sev, why, B: dense, act: () => (replan(S, town, { B: dense, sev, why }, block) ? (Q.replanAt = S.t, Q.status) : null) });
  }
  // land and noise move out of the centres
  if (!busy && weigh('move_out', P.moveOutWeight) >= P.minSeverity) {
    const m = moveOutWish(S, town, L), sev = weigh('move_out', P.moveOutWeight);
    if (m) works.push({ key: 'move_out', sev, why: 'its land in the centre is wanted for homes', B: bp(S, m.b), act: () => { moveOut(S, town, m, sev); return Q.status; } });
  }
  // (a work ties with a need of the same weight and goes first, as it once went before every need; but food comes
  // first: while food is short, every need of the food chain goes before every work)
  cands.push(...works, ...L.shortages.map(sh => ({ sh })));
  const sevOf = (c: Cand) => ('sh' in c ? c.sh.sev : c.sev), chain = foodChainOf(S);
  const food = (c: Cand) => (L.foodShort && 'sh' in c && !!c.sh.good && chain.has(c.sh.good) && c.sh.sev >= P.minSeverity ? 1 : 0);
  cands.sort((a, b) => food(b) - food(a) || sevOf(b) - sevOf(a));

  // something it recently found no room for waits `no_room_retry_seconds`; the next need goes ahead
  const roomless = (id: string) => id in Q.noRoom && S.t - Q.noRoom[id] < P.noRoomRetrySeconds;
  const out: Wish[] = [];
  const wish = (key: string, sev: number, B: BlueprintDef | null, verdict: Verdict, text: string, why: string, more: Partial<Wish> = {}): Wish => { const w: Wish = { key, sev, type: B?.id ?? null, verdict, text, why, ...more }; out.push(w); return w; };
  const name = (B: BlueprintDef) => `${article(B.name)} ${B.name}`;
  // what decided the look: the wish going ahead or saved for, else what holds the rest back
  let lead: Wish | null = null, waiting: Wish | null = null, blocked: Wish | null = null, trading: Wish | null = null, none: Wish | null = null;
  let i = 0;
  for (; i < cands.length; i++) {
    const cand = cands[i], sev = sevOf(cand);
    if (sev < P.minSeverity) break;
    if (!('sh' in cand)) {
      // works: no room for one, or not paid for yet (they are laid from the stores, and do not hold back the needs below them)
      if (cand.room) { wish(cand.key, sev, cand.B ?? null, 'room', cand.room, cand.why); continue; }
      if (cand.works) {
        const w = cand.works, owe = unpaid(S, town, w);
        if (owe) { wish(cand.key, sev, null, 'saving', `Saving ${goodName(S, owe.good)} for ${w.name}: ${cand.why}`, cand.why, { good: owe.good, have: owe.have, need: owe.need }); cand.key === 'road' ? rested(town) : restBelts(town); continue; }
        lead = goAhead(S, town, cand.key, sev, null, `${w.name[0].toUpperCase()}${w.name.slice(1)}`, cand.why, wish, () => { for (const g in w.cost) take(S, town, g, w.cost[g]); return w.lay(); });
        break;
      }
      lead = build(S, town, L, { B: cand.B!, sev, why: cand.why, key: cand.key }, wish, cand.act!, cand.key);
      break;
    }
    const sh = cand.sh;
    // with its sites all taken, a need waits for the one being built
    if (busy) { wish(sh.key, sev, null, 'queued', `${sh.why[0].toUpperCase()}${sh.why.slice(1)}, after the site being built`, sh.why); continue; }
    // what it trades for from a neighbour that makes it, it does not make
    if (sh.from) { trading ??= wish(sh.key, sev, null, 'trading', `Trading with ${sh.from.name} for ${goodName(S, sh.good!)}: ${sh.why}`, sh.why, { good: sh.good }); continue; }
    let c = propose(S, L, sh, roomless);
    if (!c) { const w = wish(sh.key, sev, null, 'none', `Nothing the ${form} knows would help: ${sh.why}`, sh.why); none ??= w; continue; }
    // a university is wanted, not needed: with no room for one, the next need goes ahead in the same look, and the
    // planner does not count the land full (which would send settlers off); with no room it may clear a workshop
    // resting with enough in store, as a dock clears the shore, but only once it is chosen and paid for
    if (c.B.learning === 'university' && (roomless(c.B.id) || (!hubs(S, town).some(h => chooseSpot(S, c!.B.id, town, false, h)) && !chooseSpot(S, c.B.id, town) && !clearFor(S, town, c.B, false)))) {
      if (!roomless(c.B.id)) Q.noRoom[c.B.id] = S.t;
      wish(sh.key, sev, c.B, 'room', `No room for ${name(c.B)}: ${c.why}`, c.why); continue;
    }
    // one proposed in place of a better it has no room for must have room itself (a warehouse is no smaller than a yard)
    if (c.instead && !roomless(c.B.id) && !chooseSpot(S, c.B.id, town)) Q.noRoom[c.B.id] = S.t;
    if (roomless(c.B.id)) { const w = wish(sh.key, sev, c.B, 'room', `No room for ${name(c.B)}: ${c.why}`, c.why); blocked ??= w; continue; }
    // food that rots is waste, not want: a store that keeps it is saved for only from what the settlement makes or trades
    // for already, never by planning a maker (a village out of land once filled it with masons, then had no room for a bakery)
    const rot = c.key === 'spoilage' ? affordable(S, c.B, town) : null;
    if (rot && !importFrom(S, town, rot.good) && !mineOf(S, town).some(b => !b.site && bp(S, b).output[rot.good])) { wish(sh.key, sev, c.B, 'input', `No ${goodName(S, rot.good)} made here for ${name(c.B)}: ${c.why}`, c.why, { good: rot.good }); continue; }
    if (c.wait) { const w = wish(sh.key, sev, c.B, c.hold ?? 'hands', c.wait, c.why, c.lacks ? { good: c.lacks } : {}); waiting ??= w; continue; }
    // short of a good whose maker it has just found no room for: saving would wait for good, so the next need goes ahead
    const owe = affordable(S, c.B, town), maker = owe ? known(S, town).find(B => B.seconds && B.output[owe.good]) : undefined;
    if (maker && roomless(maker.id) && (L.supply[owe!.good] || 0) <= 0) { const w = wish(sh.key, sev, maker, 'room', `No room for ${name(maker)}: ${c.why}`, c.why); blocked ??= w; continue; }
    lead = build(S, town, L, c, wish, null, c.B.id);
    break;
  }
  // the rest wait their turn behind the one going ahead (or saved for), or stand below the threshold
  const shown = T(S).wishListSize;
  for (i++; !busy && i < cands.length && out.length < shown; i++) {
    const cand = cands[i], sev = sevOf(cand);
    if (!('sh' in cand)) { if (sev >= P.minSeverity) wish(cand.key, sev, cand.B ?? null, 'queued', `${cand.works ? cand.works.name : cand.B ? name(cand.B) : cand.key}: ${cand.why}`, cand.why); continue; }
    const sh = cand.sh;
    if (sev < P.minSeverity) { if (sev > 0) wish(sh.key, sev, null, 'below', sh.why, sh.why); continue; }
    if (sh.from) { wish(sh.key, sev, null, 'trading', `Trading with ${sh.from.name} for ${goodName(S, sh.good!)}: ${sh.why}`, sh.why, { good: sh.good }); continue; }
    const c = propose(S, L, sh, roomless);
    if (!c) wish(sh.key, sev, null, 'none', `Nothing the ${form} knows would help: ${sh.why}`, sh.why);
    else if (roomless(c.B.id)) wish(sh.key, sev, c.B, 'room', `No room for ${name(c.B)}: ${c.why}`, c.why);
    else wish(sh.key, sev, c.B, 'queued', `${name(c.B)}: ${c.why}`, c.why);
  }
  // (nothing going ahead: what it waits for, what it has no room for, what it trades for, what nothing answers)
  if (busy) return lead ? [lead, ...out.filter(w => w !== lead)] : [];
  if (!lead) { lead = waiting ?? blocked ?? trading ?? none; if (lead && lead !== blocked && lead !== none) Q.streak = { type: '', n: 0 }; }
  if (lead) { out.splice(out.indexOf(lead), 1); out.unshift(lead); }
  else if (!out.some(w => w.verdict !== 'below')) Q.streak = { type: '', n: 0 };
  return out;
}

/** Has a road or a conveyor come due for a look (one may be laid while its sites are all taken)? */
const due = (S: State, town: Town) => roadDue(S, town) || beltDue(S, town);

/** Put a wish's text on the list, as `wish` in wishList does. */
type Put = (key: string, sev: number, B: BlueprintDef | null, verdict: Verdict, text: string, why: string, more?: Partial<Wish>) => Wish;

/** The confirmation every wish goes through: the same one tops `confirm_cycles` looks in a row before it goes ahead. */
function confirmed(Q: Town['planner'], id: string, P: ReturnType<typeof T>): boolean {
  Q.streak = Q.streak.type === id ? { type: id, n: Q.streak.n + 1 } : { type: id, n: 1 };
  return Q.streak.n >= P.confirmCycles;
}

/** A work laid from the stores (a road, a conveyor), once confirmed. */
function goAhead(S: State, town: Town, key: string, sev: number, B: BlueprintDef | null, title: string, why: string, wish: Put, lay: () => string): Wish {
  const Q = town.planner;
  if (!confirmed(Q, key, T(S))) return wish(key, sev, B, 'thinking', `Thinking about ${title.toLowerCase()}: ${why}`, why);
  if (!(key in Q.firstFor)) Q.firstFor[key] = S.t;
  Q.streak = { type: '', n: 0 };
  return wish(key, sev, B, 'going', lay(), why);
}

/**
 * The wish chosen to go ahead: paid for (or saved for, or a maker of what it lacks planned first), confirmed, then placed.
 * `act` places a work's own site (a district's yard, a replanned block, a workplace moved out); null places the
 * blueprint where the planner would put one.
 */
function build(S: State, town: Town, L: Look, c: Choice, wish: Put, act: Act | null, streakId: string): Wish {
  const P = T(S), Q = town.planner, key = c.key ?? '', top = c.sev;
  const name = (B: BlueprintDef) => `${article(B.name)} ${B.name}`;
  // what the village is working towards counts as use: it is not forgotten while saved for
  Q.want = c.B.id;
  // can't pay for it: if nothing makes the missing good, or the village has already been short of it
  // for longer than `save_patience_seconds`, whatever it was saving for, make more of it first
  const owe = affordable(S, c.B, town);
  if (owe) {
    if (Q.saving?.good !== owe.good) Q.saving = { good: owe.good, since: S.t };
    // (a good it trades for from a neighbour that makes it is waited for, not made)
    const from = importFrom(S, town, owe.good, L.demand[owe.good] || 0);
    const stuck = !from && ((L.supply[owe.good] || 0) <= 0 || S.t - Q.saving.since > P.savePatienceSeconds);
    const maker = stuck && c.key !== 'spoilage' ? known(S, town).find(B => B.seconds && B.output[owe.good]) : undefined;
    if (maker) Q.saving.since = S.t;
    const why = `${runningLow(S, owe.good)} to build ${name(c.B)}`;
    const need = c.B.cost[owe.good], more = { good: owe.good, need, have: Math.max(0, Math.floor(need - owe.short)) };
    if (maker && !affordable(S, maker, town)) { c = follow(S, L, { B: maker, sev: c.sev, why }, 0); act = null; streakId = c.B.id; }
    else return from ? wish(key, top, c.B, 'trading', `Trading with ${from.name} for ${goodName(S, owe.good)} to build ${name(c.B)}: ${c.why}`, c.why, more)
      : wish(key, top, c.B, 'saving', `Saving ${goodName(S, owe.good)} for ${name(c.B)}: ${c.why}`, c.why, more);
    // a maker that would only stand beside others short of its own input waits too (seven masons, and no stone)
    if (c.lacks) { Q.streak = { type: '', n: 0 }; return wish(key, top, c.B, c.hold ?? 'input', c.wait!, c.why, { good: c.lacks }); }
    // what the maker led to (an input's maker, a home for its worker) must be affordable as well;
    // if it is not, build the maker itself: its inputs can follow, but nothing comes without it
    if (affordable(S, c.B, town)) { c = { B: maker, sev: c.sev, why }; streakId = maker.id; }
  }
  if (!owe) Q.saving = null;
  if (!confirmed(Q, streakId, P)) return wish(key, top, c.B, 'thinking', `Thinking about ${name(c.B)}: ${c.why}`, c.why);
  if (act) {
    const done = act();
    Q.streak = { type: '', n: 0 };
    if (done === null) return wish(key, top, c.B, 'room', `No room for ${name(c.B)}: ${c.why}`, c.why);
    if (key && !(key in Q.firstFor)) Q.firstFor[key] = S.t;
    return wish(key, top, c.B, 'going', done, c.why);
  }
  const placed = place(S, town, c);
  if (placed) return wish(key, top, c.B, 'going', placed, c.why);
  return wish(key, top, c.B, 'room', `No ${c.B.bridge ? 'place' : 'room'} for ${name(c.B)}: ${c.why}`, c.why);
}

/**
 * Place a confirmed, paid-for choice where the planner would put one: a farm that can grow grows, a bridge spans its
 * water, a dock or university clears room if it must. Says what it did, or null with no room (remembered for
 * `no_room_retry_seconds`).
 */
function place(S: State, town: Town, c: Choice): string | null {
  const P = T(S), Q = town.planner, name = `${article(c.B.name)} ${c.B.name}`;
  const done = (b: Building, text: string, events = true) => {
    b.priority = 1 + Math.round(c.sev * P.urgencyPriority);
    Q.site = b.id; Q.placed++; Q.streak = { type: '', n: 0 };
    delete Q.noRoom[c.B.id];
    if (c.key && !(c.key in Q.firstFor)) Q.firstFor[c.key] = S.t;
    if (events) emit(S, 'info', S.towns.length > 1 ? `${town.name}: ${text}` : text, true);
    return text;
  };
  const roomless = () => { Q.noRoom[c.B.id] = S.t; Q.streak = { type: '', n: 0 }; return null; };
  // a farm that can grow grows instead: new fields behind it, and a place for one more hand
  const grow = S.farms && c.B.grows ? toGrow(S, town, c.B) : null, fields = grow ? growFarm(S, grow, true) : null;
  if (grow && fields) {
    fields.reason = `${fields.reason}: ${c.why}`;
    const size = sizeName(S, grow);
    return done(fields, `Growing ${article(size)} ${size.toLowerCase()}: ${c.why}`);
  }
  if (c.B.bridge) {
    const span = chooseBridge(S, c.B, town);
    if (!span) return roomless();
    const b = placeBridge(S, span.x, span.y, span.w, span.h, span.from, span.to, town.id);
    b.reason = c.why;
    chronicle(S, town.id, 'bridge', `${town.name} planned a bridge: ${c.why}`);
    return done(b, `Planning ${name}: ${c.why}`);
  }
  // in a village or town, homes go first onto open land in the district centres, where workplaces moved out or came down
  // (once it has laid roads, only along one: a home off the roads goes where the planner would put it anyway)
  let spot = c.B.homes && formOf(S, town) !== 'hamlet' ? centreSpot(S, c.B.id, town) : null;
  if (spot && S.world.roads > 0 && !alongRoad(S, c.B, spot)) spot = null;
  spot ??= chooseSpot(S, c.B.id, town);
  // a dock looks along the shores of every district, newest first (and so does a university)
  if (c.B.shore || c.B.learning === 'university') for (const h of hubs(S, town).reverse()) spot ??= chooseSpot(S, c.B.id, town, false, h);
  // a dock with no shore left clears one: a workshop on the shore comes down for it, as roads clear their line
  if (!spot && c.B.shore) {
    const cleared = clearShore(S, town, c.B);
    if (cleared) {
      spot = cleared.spot;
      chronicle(S, town.id, 'dock', `${town.name} cleared ${article(bp(S, cleared.cut).name)} ${bp(S, cleared.cut).name.toLowerCase()} from its shore for a dock`);
    }
  }
  // a university chosen and paid for, with no room, clears a workshop resting with enough in store
  if (!spot && c.B.learning === 'university') spot = clearFor(S, town, c.B);
  if (!spot) return roomless();
  const b = placeBuilding(S, c.B.id, spot.x, spot.y, false, spot.rot)!;
  b.town = town.id;
  b.reason = c.why;
  return done(b, `Planning ${name}: ${c.why}`);
}
