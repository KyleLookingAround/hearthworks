/**
 * What each settlement knows how to build, and how that changes. A settlement's
 * knowledge is a small OKF-style bundle: one record per blueprint with who came up
 * with it, which settlements have verified it in use, and when it was last used.
 *
 *   invent    struggling with a need a blueprint answers, a village may think of it
 *   verify    a building that runs well for `verify_seconds` proves its blueprint here
 *   learn     building something the village doesn't know (the player's hand) teaches it
 *   share     a visitor tells a neighbour what home has learned, with its verifications, and brings news back;
 *             a library's scribe copies its records for the neighbours, and readers take in what other libraries hold
 *   forget    discovered knowledge with nothing built from it for `forget_after_seconds` is lost
 *
 * Invention draws from S.krng, never S.rng, so knowledge cannot shift the rest of the sim.
 */
import { rand } from './rng.ts';
import { goToBuilding } from './agents.ts';
import { cancelTask } from './logistics.ts';
import { barter, homecoming } from './trade.ts';
import { bringFeast, learningAt, reads } from './people.ts';
import { bp, chronicle, door, emit, villagers } from './core.ts';
import { reachable } from './path.ts';
import { struckLately } from './hardship.ts';
import { traffic } from './roads.ts';
import { swapCharts } from './sea.ts';
import { offered } from './farms.ts';
import { setOff } from './ships.ts';
import type { Agent, BlueprintDef, Content, Knowledge, State, Town } from './types.ts';
import { caches } from './caches.ts';

const K = (S: State) => S.content.tuning.knowledge;
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const name = (S: State, id: string) => S.content.blueprints[id]?.name ?? id;

/** Everything without a `discovery` block: what every settlement starts out knowing. */
export function foundersKnowledge(content: Content, offered: (B: BlueprintDef) => boolean = () => true): Record<string, Knowledge> {
  const out: Record<string, Knowledge> = {};
  for (const B of Object.values(content.blueprints)) {
    if (B.discovery || !offered(B)) continue;
    out[B.id] = { by: 'founders', at: 0, verified: [{ by: 'founders', at: 0 }], from: null, learned: 0, used: 0 };
  }
  return out;
}

export const knows = (town: Town, id: string) => id in town.knows;

/** How hard a settlement is struggling with a need, 0 to 1. */
export function pressure(S: State, town: Town, need: string): number {
  if (need === 'hauling') { const t = K(S).haulTarget; return clamp01((town.haul - t) / (1 - t)); }
  if (need === 'crossing') return town.cut;
  // boats (with ships on): its people stayed ashore for want of a free boat, lately
  if (need === 'boats') return S.ships && S.t - town.boatless <= S.content.tuning.sea.boatlessMemorySeconds ? 1 : 0;
  // bread: how badly its planner is short of bread
  if (need === 'bread') return clamp01(town.planner.wants.bread ?? 0);
  if (need === 'detours') return town.detour;
  // learning (with people on): a loss still fresh in memory, and the strain of needs nothing known meets
  if (need === 'forgetting') return S.people && S.chronicle.some(c => c.town === town.id && c.kind === 'forgotten' && S.t - c.t <= K(S).forgettingMemorySeconds) ? 1 : 0;
  // hardship: struck within `memory_seconds`
  if (need === 'fire' || need === 'flood' || need === 'sickness' || need === 'raids') return struckLately(S, town, need) ? 1 : 0;
  if (need === 'traffic') return traffic(S, town);
  // reading (with people on): in a settlement with a library, the share of its grown villagers who cannot read it
  if (need === 'reading') {
    if (!S.people || !learningAt(S, town.id, 'library', false)) return 0;
    const printed = learningAt(S, town.id, 'press');
    let grown = 0, readers = 0;
    for (const a of villagers(S)) if (a.home?.town === town.id && a.role !== 'child') { grown++; if (reads(S, a, printed)) readers++; }
    return grown ? 1 - readers / grown : 0;
  }
  // conveying: carriers run off their feet although its depots' bots are winding about: hauling beyond the bots' reach
  if (need === 'conveying') return S.buildings.some(b => b.town === town.id && !b.site && bp(S, b).couriers) ? pressure(S, town, 'hauling') : 0;
  if (need === 'distance') return S.carts ? clamp01((town.reach - K(S).distanceFrom) / K(S).distanceSpan) : 0;
  if (need === 'long_hauls') return S.carts ? clamp01((town.reach - K(S).longHaulFrom) / K(S).distanceSpan) : 0;
  if (need === 'inquiry') {
    if (!S.people) return 0;
    let p = 0;
    // (ideas only scholars find do not count: a settlement cannot think of them, and the university is what opens them)
    for (const B of Object.values(S.content.blueprints)) if (B.discovery && B.discovery.need !== 'inquiry' && !B.discovery.university && !knows(town, B.id) && ageNeeded(S, B.id) <= town.age) p = Math.max(p, pressure(S, town, B.discovery.need));
    return p;
  }
  return 0;
}

export const NEED_TEXT: Record<string, string> = { bread: 'its bakers cannot keep up', distance: 'its goods travel a long way', long_hauls: 'its carts go a long way', forgetting: 'it had lost knowledge it needed', inquiry: 'it has needs that nothing it knows can meet', hauling: 'carriers are run off their feet', conveying: 'its carriers are run off their feet where its bots cannot reach', crossing: 'the neighbours are across water nobody can cross', boats: 'its people wait ashore for a free boat', detours: 'water keeps the village from land close by, or sends everyone the long way round', fire: 'fire had swept through it', flood: 'the waters had risen over its low land', sickness: 'sickness had gone through its homes', raids: 'raiders had fallen on its stores', traffic: 'its goods travel a long way along winding paths', reading: 'few of its people can read what its library holds' };

/** A settlement's age: the latest era it has reached, knowing each era's `share` of its discoveries and every earlier era's. */
export function ageOf(S: State, town: Town): number {
  let age = 0;
  S.content.eras.forEach((E, i) => {
    if (age !== i - 1 && i > 0) return;
    const known = E.discoveries.filter(id => id in town.knows).length;
    if (!E.discoveries.length || known / E.discoveries.length >= E.share) age = i;
  });
  return age;
}

/** Can this settlement read from libraries: one of its own standing, and a grown villager schooled as a child to read in it? */
export const readsAt = (S: State, town: Town) => learningAt(S, town.id, 'library', false) && (learningAt(S, town.id, 'press') || villagers(S).some(a => a.schooled && a.role !== 'child' && a.home?.town === town.id));

/**
 * The discoveries only scholars think of (a university at work) that a settlement does not yet know, each with what it
 * waits on: `university` (none at work here), `after` (a blueprint it must know first), `age` (a later age), or `need`
 * (not pressed hard enough yet); `ready` when its scholars could think of it now.
 */
export function scholarly(S: State, town: Town): { B: BlueprintDef; waits: 'university' | 'after' | 'age' | 'need' | 'ready'; missing: string[] }[] {
  const P = K(S), university = learningAt(S, town.id, 'university');
  return Object.values(S.content.blueprints).filter(B => B.discovery?.university && !knows(town, B.id) && offered(S, B)).sort((a, b) => a.order - b.order).map(B => {
    const missing = B.discovery!.after.filter(id => !knows(town, id));
    const waits = !university ? 'university' : missing.length ? 'after' : town.age < ageNeeded(S, B.id) ? 'age'
      : pressure(S, town, B.discovery!.need) < P.struggleSeverity * P.universityThreshold * (town.levers.encourage === B.id ? P.encourageThreshold : 1) ? 'need' : 'ready';
    return { B, waits, missing };
  });
}

/** The age a settlement must have reached to think of a blueprint: the era that unlocks it, else the first. */
export const ageNeeded = (S: State, id: string) => Math.max(0, S.content.eras.findIndex(E => E.unlocks.includes(id)));

/** Has this settlement proven the blueprint in use itself? Founders' knowledge counts. */
const provenHere = (town: Town, k: Knowledge) => k.verified.some(v => v.by === town.name || v.by === 'founders');

/** Everything beyond founding knowledge, proven or not: what its visitors talk about. Verifications travel with it. */
export function shareable(town: Town): Record<string, Knowledge> {
  const out: Record<string, Knowledge> = {};
  for (const id in town.knows) {
    const k = town.knows[id];
    if (k.by !== 'founders') out[id] = { ...k, verified: k.verified.map(v => ({ ...v })) };
  }
  return out;
}

/** How a record reached a settlement: by a visitor, a scribe's copy, or its readers at a library. */
type Way = 'visit' | 'copy' | 'read';
const HOW: Record<Way, (from: string, town: string, what: string) => string> = {
  visit: (from, town, what) => `A visitor from ${from} taught ${town} the ${what}`,
  copy: (from, town, what) => `A scribe in ${from} copied the ${what} for ${town}`,
  read: (from, town, what) => `Readers in ${town} learned the ${what} from the shelves of ${from}`,
};

/** Learn what a visitor (or a scribe, or a book) brought, keeping the original inventor and every verification. */
function teach(S: State, town: Town, recs: Record<string, Knowledge>, from: string, how: Way = 'visit') {
  for (const id in recs) {
    const r = recs[id], mine = town.knows[id];
    if (mine) {
      for (const v of r.verified) if (!mine.verified.some(m => m.by === v.by)) mine.verified.push({ ...v });
      continue;
    }
    town.knows[id] = { by: r.by, at: r.at, verified: r.verified.map(v => ({ ...v })), from, learned: S.t, used: S.t };
    S.stats.taught++;
    const text = HOW[how](from, town.name, name(S, id));
    chronicle(S, town.id, 'taught', text);
    emit(S, 'good', text);
  }
}

/** Settlements whose university has had scholars at work (read once from the chronicle, so a loaded game knows too). */
const opened = (S: State) => { const C = caches(S.world); return C.opened ??= new Set(S.chronicle.filter(c => c.kind === 'scholars').map(c => c.town)); };

/** Once a second: pressures, invention, verification, learning by hand, forgetting and visits. */
export function updateKnowledge(S: State, dt: number) {
  const P = K(S);
  for (const town of S.towns) {
    // hauling strain: share of carriers on deliveries someone asked for (not surplus runs to storage)
    const people = villagers(S).filter(a => a.home?.town === town.id && a.role === 'carrier' && a.state !== 'visit');
    const busy = people.length ? people.filter(a => a.task && !S.content.blueprints[a.task.dst.type].storage).length / people.length : 0;
    town.haul += (busy - town.haul) * Math.min(1, dt / P.haulSmoothingSeconds);

    for (const b of S.buildings) {
      if (b.town !== town.id) continue;
      let k = town.knows[b.type];
      if (!k) {
        if (b.site) continue;
        // built before the village knew how: the player's hand taught it
        k = town.knows[b.type] = { by: 'hand', at: S.t, verified: [], from: null, learned: S.t, used: S.t };
        emit(S, 'info', `${town.name} learned the ${name(S, b.type)} from the one you built`);
        chronicle(S, town.id, 'learned', `${town.name} learned the ${name(S, b.type)} from the one the steward built`);
      }
      k.used = S.t;
      if (b.site || b.status.l !== 'ok') continue;
      b.used += dt;
      if (b.used >= P.verifySeconds && !k.verified.some(v => v.by === town.name)) {
        k.verified.push({ by: town.name, at: S.t });
        if (k.by !== 'founders') { emit(S, 'good', `${town.name} has proven the ${name(S, b.type)} in use`); chronicle(S, town.id, 'proven', `${town.name} proved the ${name(S, b.type)} in use`); }
      }
    }

    // a university's first scholars at work open lines of inquiry no village of hands alone takes up: the chronicle says which
    if (learningAt(S, town.id, 'university') && !opened(S).has(town.id)) {
      opened(S).add(town.id);
      const ideas = Object.values(S.content.blueprints).filter(B => B.discovery?.university && offered(S, B)).sort((a, b) => a.order - b.order).map(B => `the ${B.name}`);
      const list = ideas.length > 1 ? `${ideas.slice(0, -1).join(', ')} and ${ideas[ideas.length - 1]}` : ideas[0];
      const text = `Scholars took up their inquiries at the university of ${town.name}` + (list ? `: only they may think of ${list}` : '');
      chronicle(S, town.id, 'scholars', text);
      emit(S, 'good', text);
    }

    for (const B of Object.values(S.content.blueprints)) {
      if (!B.discovery || knows(town, B.id) || B.discovery.after.some(id => !knows(town, id))) continue;
      // some discoveries need scholars at work: a settlement without a university never comes up with them
      if (B.discovery.university && !learningAt(S, town.id, 'university')) continue;
      // and blueprints of a later age's own come only to a settlement of that age
      if (town.age < ageNeeded(S, B.id)) continue;
      // encouragement: the player backs this line of thought, so it comes at less strain and sooner
      const backed = town.levers.encourage === B.id;
      // scholars at a university take up every line of inquiry sooner, at less strain, and pursue it faster
      const university = learningAt(S, town.id, 'university'), scholars = university ? P.universityFactor : 1;
      if (pressure(S, town, B.discovery.need) < P.struggleSeverity * (backed ? P.encourageThreshold : 1) * (university ? P.universityThreshold : 1)) continue;
      if (rand(S.krng) >= dt / (B.discovery.meanSeconds / (backed ? P.encourageFactor : 1) / scholars)) continue;
      town.knows[B.id] = { by: town.name, at: S.t, verified: [], from: null, learned: S.t, used: S.t };
      S.stats.invented++;
      // a discovery only scholars make says so
      const text = B.discovery.university ? `The scholars of ${town.name} came up with the ${B.name}, an idea only a university finds: ${NEED_TEXT[B.discovery.need] ?? B.discovery.need}` : `${town.name} came up with the ${B.name}: ${NEED_TEXT[B.discovery.need] ?? B.discovery.need}`;
      chronicle(S, town.id, 'invented', text);
      if (town.levers.encourage === B.id) town.levers.encourage = null;
      emit(S, 'good', text);
    }

    if (town.planner.want && town.knows[town.planner.want]) town.knows[town.planner.want].used = S.t;
    // a library keeps everything on its shelves: nothing is forgotten while one stands
    const shelved = learningAt(S, town.id, 'library');
    for (const id of Object.keys(town.knows)) {
      if (shelved) break;
      const k = town.knows[id];
      if (k.by === 'founders' || S.t - k.used <= P.forgetAfterSeconds) continue;
      delete town.knows[id];
      S.stats.forgotten++;
      chronicle(S, town.id, 'forgotten', `${town.name} forgot how to build the ${name(S, id)}`);
      emit(S, 'bad', `${town.name} forgot how to build the ${name(S, id)}: nobody had built one in a long while`);
    }

    // its age: the latest era it has reached with every one before it
    const age = ageOf(S, town);
    if (age !== town.age) {
      const E = S.content.eras[age], up = age > town.age;
      town.age = age;
      chronicle(S, town.id, 'age', up ? `${town.name} entered the Age of ${E.name}` : `${town.name} fell back to the Age of ${E.name}`);
      emit(S, up ? 'good' : 'bad', up ? `${town.name} entered the Age of ${E.name}` : `${town.name} fell back to the Age of ${E.name}: what it knew was forgotten`);
    }

    // every ten seconds: how much grass near home cannot be walked to, and how often trips go the long way round
    if (Math.floor(S.t) % 10 === 0) town.detour = detourPressure(S, town);

    // a library's scribe copies its records for every neighbour now and then
    town.copyT += dt;
    if (town.copyT >= P.copyEverySeconds) {
      town.copyT = 0;
      if (S.towns.length > 1 && learningAt(S, town.id, 'library', true)) for (const o of S.towns) if (o !== town) teach(S, o, shareable(town), town.name, 'copy');
      // and a settlement with a library of its own and people who can read takes in what every other library holds
      if (S.towns.length > 1 && readsAt(S, town)) for (const o of S.towns) if (o !== town && learningAt(S, o.id, 'library', false)) teach(S, town, shareable(o), o.name, 'read');
    }

    town.visitT += dt;
    if (town.visitT >= P.visitEverySeconds && S.towns.length > 1 && sendVisitor(S, town)) town.visitT = 0;
  }
}

/**
 * The nearest other settlement gets a visitor: a carrier with empty hands, never the last one.
 * One on its way to fetch something drops the job (the goods stay where they were).
 * Returns false to try again next second.
 */
function sendVisitor(S: State, town: Town): boolean {
  const home = S.bmap.get(town.store);
  if (!home) return false;
  let host: Town | null = null, hd = Infinity;
  for (const o of S.towns) {
    const s = S.bmap.get(o.store);
    if (o === town || !s) continue;
    const d = Math.hypot(s.x - home.x, s.y - home.y);
    if (d < hd) { hd = d; host = o; }
  }
  if (!host) return false;
  // small or already-visiting settlements keep their people at home
  const people = villagers(S).filter(a => a.home?.town === town.id);
  if (people.length < K(S).visitMinVillagers || people.some(a => a.visit?.from === town.id)) return false;
  const carriers = people.filter(a => a.role === 'carrier' && a.state !== 'visit');
  if (carriers.length < 2) return false;
  const a = carriers.find(c => !c.carry && (c.state === 'idle' || c.state === 'wander' || c.state === 'toSrc'));
  if (!a) return false;
  cancelTask(a);
  a.visit = { from: town.id, to: host.id, back: false, carry: shareable(town), boat: false };
  a.state = 'visit';
  if (!setOff(S, a, town, () => goToBuilding(S, a, S.bmap.get(host.store)!))) {
    // no way there: across water nobody here can cross yet. Try again next visit.
    a.visit = null; a.state = 'idle'; town.cut = 1; town.visitT = 0;
    return false;
  }
  town.cut = 0;
  a.visit.boat = a.path.some(([x, y]) => S.world.ground[y * S.world.w + x] === 0);
  return true;
}

/** A visitor reached the end of a leg: trade knowledge at the host, or report home. */
export function arrive(S: State, a: Agent) {
  const v = a.visit;
  if (!v) { a.state = 'idle'; return; }
  const from = S.towns[v.from], to = S.towns[v.to];
  if (!v.back) {
    if (v.trade) barter(S, a);
    teach(S, to, v.carry, from.name);
    swapCharts(S, a, to, from);
    v.carry = shareable(to); v.back = true;
    // whoever rowed over rows home from the shore they landed on
    const home = S.bmap.get(from.store);
    if (home && goToBuilding(S, a, home, { launchAnywhere: v.boat })) return;
    // a stranded porter's load still reaches home, as they do
    if (v.trade) homecoming(S, a);
    strand(S, a, from, to);
  } else { teach(S, from, v.carry, to.name); swapCharts(S, a, from, to); bringFeast(S, from, to); if (v.trade) homecoming(S, a); }
  a.visit = null; a.state = 'idle';
}

/**
 * A visitor who finds no way home (the way they came has been built over, or the water they crossed
 * has no dock on this side) settles with the hosts if there is a free bed. Otherwise they make their
 * own way back: they are moved home, so nobody is left stranded working for a village they cannot reach.
 */
function strand(S: State, a: Agent, from: Town, to: Town) {
  const bed = S.buildings.find(b => b.town === to.id && !b.site && (S.content.blueprints[b.type].homes ?? 0) > b.residents.length);
  if (bed) {
    if (a.home) a.home.residents = a.home.residents.filter(id => id !== a.id);
    a.home = bed; bed.residents.push(a.id);
    emit(S, 'info', `A visitor from ${from.name} found no way home and settled in ${to.name}`, true);
    return;
  }
  const d = door(S.bmap.get(from.store)!);
  a.x = d.x + 0.5; a.y = d.y + 0.5; a.path = [];
}

/**
 * Pressure to bridge water, 0 to 1: the larger of the share of recent trips that went the long way round
 * (`detour_ratio` times the straight line or more) and how much of the grass within the planner's reach
 * cannot be walked to from storage, past the first fifth.
 */
function detourPressure(S: State, town: Town): number {
  const P = S.content.tuning.planner, w = S.world, store = S.bmap.get(town.store);
  if (!store) return 0;
  const d = door(store), reach = reachable(w, d.x, d.y), c = { x: store.x + store.w / 2, y: store.y + store.h / 2 };
  const R = P.searchRadius + 10;
  let grass = 0, cut = 0;
  for (let y = Math.max(0, Math.floor(c.y - R)); y <= Math.min(w.h - 1, Math.ceil(c.y + R)); y++) for (let x = Math.max(0, Math.floor(c.x - R)); x <= Math.min(w.w - 1, Math.ceil(c.x + R)); x++) {
    const i = y * w.w + x;
    if (w.ground[i] !== 2 || Math.hypot(x + 0.5 - c.x, y + 0.5 - c.y) > R) continue;
    grass++;
    if (!reach[i]) cut++;
  }
  const away = grass ? clamp01((cut / grass - 0.2) / 0.4) : 0;
  const trips = clamp01(town.detours.filter(t => S.t - t[5] < 300).length / 8);
  return Math.max(away, trips);
}

/** Short provenance line for the player, e.g. "came up with here", "learned from Hearth". */
export function originText(town: Town, k: Knowledge): string {
  if (k.by === 'founders') return 'known since the founding';
  if (k.by === 'hand') return 'learned from the one you built';
  if (k.from) return `learned from ${k.from}${k.by !== k.from ? ` (first thought of in ${k.by})` : ''}`;
  return k.by === town.name ? 'thought of here' : `first thought of in ${k.by}`;
}

export const verifiedHere = (town: Town, k: Knowledge) => provenHere(town, k);
