/**
 * The steward's side of the game: the chronicle as an OKF log, and an advisor that reads the
 * planners and the settlements to point the player at a lever. It reads the state, and writes only its own
 * tips on each settlement (`advice`, `advised`).
 */
import { inNuisance } from './surroundings.ts';
import { NEED_TEXT, ageNeeded, knows, pressure, scholarly, thinkable } from './knowledge.ts';
import { dietOf, offered } from './farms.ts';
import { defence, guarded } from './hardship.ts';
import { centreOf, hubs, reachOf } from './planner/core.ts';
import { article } from './planner/text.ts';
import { bp, ctr, door, nearestTown } from './core.ts';
import { reachable } from './path.ts';
import { NOBUILD } from './place.ts';
import { learningAt } from './people.ts';
import { seasonOf, storesOnTrack } from './seasons.ts';
import type { State, Tip, TipAct, Town } from './types.ts';

/** OKF log labels for each kind of chronicle line. */
const LABEL: Record<string, string> = {
  founded: 'Creation', invented: 'Creation', scholars: 'Creation', district: 'Creation', bridge: 'Creation',
  form: 'Update', replanned: 'Update', taught: 'Update', learned: 'Update', proven: 'Update', season: 'Update', trade: 'Creation', birth: 'Creation', custom: 'Update', settled: 'Creation', age: 'Update',
  forgotten: 'Deprecation', pulled: 'Deprecation', moved: 'Update',
  fire: 'Finding', flood: 'Finding', sickness: 'Finding', raids: 'Finding', road: 'Creation', belt: 'Creation', dock: 'Creation', farm: 'Update', feast: 'Update', naming: 'Update', craft: 'Creation', peace: 'Creation',
};

/**
 * One settlement's chronicle (or every settlement's) as an OKF log: dated sections, newest first,
 * one labelled bullet per line of history. Game minutes stand in for dates.
 */
export function chronicleLog(S: State, town?: number): string {
  const lines = S.chronicle.filter(c => town === undefined || c.town === town);
  const title = town === undefined ? 'Chronicle of the world' : `Chronicle of ${S.towns[town]?.name ?? 'a settlement'}`;
  const byMinute = new Map<number, string[]>();
  for (const c of [...lines].reverse()) {
    const m = Math.floor(c.t / 60);
    if (!byMinute.has(m)) byMinute.set(m, []);
    byMinute.get(m)!.push(`* **${LABEL[c.kind] ?? 'Update'}**: ${c.text}`);
  }
  let out = `# ${title}\n`;
  for (const [m, bullets] of byMinute) out += `\n## Minute ${m}\n\n${bullets.join('\n')}\n`;
  return out;
}

/** The ways goods go, in words, in the order the Steward panel lists them. */
const WAYS: [string, string][] = [['foot', 'on foot'], ['cart', 'by handcart'], ['ox', 'by ox cart'], ['bot', 'by bot'], ['belt', 'along belts']];

/**
 * How a settlement's goods have gone since its founding: each way's share of the goods delivered to it (to the nearest
 * whole per cent, ways it has not used left out), and how many were handed on at its yards. Null before any.
 */
export function waysOf(S: State, town: Town): { text: string; shares: number[]; handed: number } | null {
  const w = town.ways, all = WAYS.reduce((s, [k]) => s + (w[k] || 0), 0);
  if (!all) return null;
  const shares = WAYS.map(([k]) => Math.round((100 * (w[k] || 0)) / all));
  const text = WAYS.map(([, words], i) => (shares[i] ? `${shares[i]}% ${words}` : '')).filter(Boolean).join(', ');
  return { text, shares, handed: Math.floor(w.handed || 0) };
}

/** The priority levels a need can be set to, lowest first (the Steward panel's Low, Normal, High and First). */
export const PRIORITIES = [0.5, 1, 2, 4];
/** A need's priority one level up, or null when it is already first. */
const raise = (town: Town, need: string): TipAct | null => {
  const now = town.levers.priority[need] ?? 1, up = PRIORITIES.find(v => v > now);
  return up === undefined ? null : { lever: 'priority', need, value: up };
};
const LEVEL: Record<number, string> = { 0.5: 'Low', 1: 'Normal', 2: 'High', 4: 'First' };
const raiseLabel = (act: TipAct, what: string) => `${what}: ${'need' in act ? LEVEL[act.value] ?? act.value : ''}`;

/** Can the steward usefully encourage this idea here: unknown, offered, one it could think of now, and not encouraged already? */
const encourageable = (S: State, town: Town, id: string) => {
  const B = S.content.blueprints[id];
  return !!B?.discovery && !knows(town, id) && offered(S, B) && thinkable(S, town, B) && town.levers.encourage !== id;
};

/**
 * What a settlement can do to get scholars at work, as a tip's ending and its act, or null when nothing the player
 * does would bring one soon: a hamlet is too small for a university, and one standing that waits for a scholar, or a
 * university nobody here could think of yet, is not the player's to give.
 */
function universityWay(S: State, town: Town): { text: string; act: TipAct | null; label: string | null } | null {
  if (town.form === 'hamlet' || learningAt(S, town.id, 'university')) return null;
  if (S.buildings.some(b => b.town === town.id && !b.dead && S.content.blueprints[b.type].learning === 'university')) return null;
  if (knows(town, 'university')) return { text: `place a University (its planner builds one in a town, or in a village of ${S.content.tuning.knowledge.universityVillagers} with a library that makes what it is built of)`, act: null, label: null };
  if (encourageable(S, town, 'university')) return { text: 'encourage the University', act: { lever: 'encourage', value: 'university' }, label: 'Encourage the University' };
  return null;
}

/**
 * Is there land a zone would open to the planner: no-build land of its own to lift, or `zone_room_tiles` of open,
 * walkable land of its own beyond where it looks now but within `search_radius_max` of a district (a zone there draws
 * the planner to it)? On a full island there is none, and zoning is no advice.
 */
function roomToZone(S: State, town: Town): boolean {
  const W = S.world, M = S.content.tuning.planner.searchRadiusMax, need = S.content.tuning.advisor.zoneRoomTiles, store = S.bmap.get(town.store);
  if (!store) return false;
  const d = door(store), reach = reachable(W, d.x, d.y), seen = new Set<number>();
  let open = 0;
  for (const h of hubs(S, town)) {
    const c = ctr(h), R = reachOf(S, town, h);
    for (let y = Math.max(0, Math.floor(c.y - M)); y <= Math.min(W.h - 1, Math.ceil(c.y + M)); y++) for (let x = Math.max(0, Math.floor(c.x - M)); x <= Math.min(W.w - 1, Math.ceil(c.x + M)); x++) {
      const i = y * W.w + x, far = Math.hypot(x + 0.5 - c.x, y + 0.5 - c.y);
      if (far > M || seen.has(i)) continue;
      seen.add(i);
      if (W.ground[i] !== 2 || W.bgrid[i] >= 0 || W.tree[i] || W.road[i] || W.belt[i] || !reach[i]) continue;
      if (S.towns.length > 1 && nearestTown(S, x + 0.5, y + 0.5) !== town.id) continue;
      if (W.zone[i] === NOBUILD) return true;
      if (far > R && ++open >= need) return true;
    }
  }
  return false;
}

/**
 * Every tip that holds for one settlement now, ranked: each kind's weight (`weights` in the advisor's tuning) and how
 * pressing it is. Only advice the player can act on: a lever or a law (offered as one tap), an idea to encourage that
 * it could think of now, a zone where there is land to zone, or a building it knows to place. What waits on a later
 * age, a scholar or a neighbour is shown in the Knowledge panel, not advised.
 */
export function adviceFor(S: State, town: Town): Tip[] {
  const out: Tip[] = [], wishes = town.planner.wishes, W = S.content.tuning.advisor.weights;
  const tip = (key: string, text: string, why: string, press = 1, act: TipAct | null = null, label: string | null = null) => {
    out.push({ key, text, why, score: (W[key.split(':')[0]] ?? 1) * (1 + Math.max(0, Math.min(1, press))), at: S.t, act, label });
  };
  const hungryBelow = S.content.tuning.needs.adviseHungryBelow;
  if (town.fed < hungryBelow) {
    const act = raise(town, 'bread');
    if (act) tip('hungry', `${town.name} is going hungry: raise the priority of bread.`, `bread ${act.value}`, (hungryBelow - town.fed) / hungryBelow, act, raiseLabel(act, 'Bread'));
    else if (!town.laws.rationing) tip('hungry', `${town.name} is going hungry with bread first already: ration food to stretch its stores.`, 'ration', 1, { law: 'rationing', value: true }, 'Ration food');
  }
  // a need on its planner's list that nothing it knows would answer
  const none = wishes.find(w => w.verdict === 'none'), stuck = none ? [none.text, none.why] : null;
  if (stuck) {
    const need = Object.entries(NEED_TEXT).find(([, text]) => text === stuck[1])?.[0];
    const answers = need ? Object.values(S.content.blueprints).filter(B => B.discovery?.need === need && !knows(town, B.id) && offered(S, B)) : [];
    // an answer it could think of now first: encourage it; one only scholars find, the way to a university
    const now = answers.find(B => encourageable(S, town, B.id)), scholars = !now && answers.find(B => B.discovery!.university && !B.discovery!.after.some(id => !knows(town, id)) && town.age >= ageNeeded(S, B.id));
    if (now) tip(`answer:${need}`, `Nobody in ${town.name} has an answer to "${stuck[1]}": encourage them to think of the ${now.name}.`, now.id, 1, { lever: 'encourage', value: now.id }, `Encourage the ${now.name}`);
    else if (scholars) {
      const way = universityWay(S, town);
      if (way) tip(`answer:${need}`, `Nobody in ${town.name} has an answer to "${stuck[1]}": only scholars think of the ${scholars.name}, ${way.text}.`, scholars.id, 1, way.act, way.label);
    }
  }
  // an idea only scholars find, pressing here, with no university at work to find it
  const K = S.content.tuning.knowledge;
  if (!stuck) {
    const waiting = scholarly(S, town).find(x => x.waits === 'university' && !x.missing.length && town.age >= ageNeeded(S, x.B.id) && pressure(S, town, x.B.discovery!.need) >= K.struggleSeverity * K.universityThreshold);
    const way = waiting && universityWay(S, town);
    if (waiting && way) tip(`scholars:${waiting.B.id}`, `Scholars would think of the ${waiting.B.name} for ${town.name}, as ${NEED_TEXT[waiting.B.discovery!.need] ?? waiting.B.discovery!.need}: ${way.text}.`, way.text, 1, way.act, way.label);
  }
  // a wish on its planner's list with no room for it
  const roomy = wishes.find(w => w.verdict === 'room' && w.type && w.key !== 'university'), R = roomy && S.content.blueprints[roomy.type!];
  const room = R ? [roomy.text, R.bridge ? 'place' : 'room', `${article(R.name)} ${R.name}`, roomy.why] : null;
  if (room && roomToZone(S, town)) tip('room', `${town.name} has no ${room[1]} for ${room[2]} (${room[3]}): paint a zone where there is room, or lift no-build land.`, room[2]);
  // hard times: raiders who outnumber the defence (a camp it sends bread to leaves it be), a winter store fallen behind, the hungry kept from leaving
  if (S.hardship) {
    const yard = S.bmap.get(town.store), reach = S.content.tuning.hardship.raidReach;
    const threat = yard ? Math.max(0, ...S.camps.filter(c => !(c.friend === town.id && c.goodwill > 0) && Math.hypot(c.x - yard.x, c.y - yard.y) <= reach).map(c => Math.floor(c.strength))) : 0;
    const act = raise(town, 'raids');
    if (threat > defence(S, town).total && act) tip('raiders', `Raiders camped within reach of ${town.name} outnumber its defence: raise the priority of defence against raiders${encourageable(S, town, 'watchtower') ? ', or encourage the Watchtower' : ''}.`, `raids ${act.value}`, 1, act, raiseLabel(act, 'Defence'));
  }
  const season = seasonOf(S);
  if ((season === 'summer' || season === 'autumn') && !storesOnTrack(S, town) && !town.laws.rationing) tip('winter_store', `${town.name}'s store for the winter has fallen behind: ration food before the frost.`, season, 1, { law: 'rationing', value: true }, 'Ration food');
  if (!town.laws.leave && town.fed < 1) tip('hungry_stay', `The hungry of ${town.name} may not leave, and may starve: let them go, or ration food.`, '', 1 - town.fed, { law: 'leave', value: true }, 'Let them leave');
  // long hauls: carts to think of or to feed
  if (S.carts) {
    const tiles = Math.round(town.reach), barns = S.buildings.filter(b => b.town === town.id && !b.site && S.content.blueprints[b.type].oxen);
    if (pressure(S, town, 'distance') >= 1 && encourageable(S, town, 'cart_shed')) tip('cart_shed', `${town.name}'s deliveries go ${tiles} tiles on average: encourage the Cart Shed.`, '', 1, { lever: 'encourage', value: 'cart_shed' }, 'Encourage the Cart Shed');
    else if (pressure(S, town, 'long_hauls') >= 1 && knows(town, 'cart_shed') && encourageable(S, town, 'ox_barn')) tip('ox_barn', `${town.name}'s carts go ${tiles} tiles on average: encourage the Ox Barn.`, '', 1, { lever: 'encourage', value: 'ox_barn' }, 'Encourage the Ox Barn');
    const feed = S.content.tuning.logistics.oxFeed, act = raise(town, 'bread');
    if (act && barns.length && barns.every(b => Object.keys(S.content.blueprints[b.type].keepStocked).some(g => (b.inv[g] || 0) < feed))) tip('oxen', `The oxen of ${town.name} wait for wheat: raise the priority of bread.`, `bread ${act.value}`, 1, act, raiseLabel(act, 'Bread'));
    // long hauls still walked: carts would take them, and hand the rest of each cartload on at the yard of the district they go to
    const Wy = town.ways, A = S.content.tuning.logistics, haul = raise(town, 'hauling');
    if (haul && knows(town, 'cart_shed') && (Wy.long || 0) >= A.adviseLongHauls && (Wy.longFoot || 0) >= A.adviseFootShare * (Wy.long || 0)) tip('long_hauls', `${Math.round((100 * (Wy.longFoot || 0)) / (Wy.long || 1))}% of ${town.name}'s long hauls go on foot, one or two goods at a time: raise the priority of hauling for more cart sheds, which take them by the cartload and hand the rest on at its yards.`, `hauling ${haul.value}`, 1, haul, raiseLabel(haul, 'Hauling'));
  }
  // with farms that grow, a diet of bread alone, where it knows something that would vary it and none is on its way
  if (S.farms && S.buildings.filter(b => b.town === town.id && !b.site && S.content.blueprints[b.type].homes).length >= S.content.tuning.farms.adviseDietHomes && !dietOf(S, town.id).size) {
    const diet = S.content.tuning.farms.diet, growers = Object.values(S.content.blueprints).filter(B => knows(town, B.id) && offered(S, B) && diet.some(g => B.output[g])).sort((a, b) => a.order - b.order).map(B => `${article(B.name)} ${B.name}`);
    // (not while one is already being built or planned)
    const coming = S.buildings.some(b => b.town === town.id && b.site && diet.some(g => S.content.blueprints[b.type].output[g])) || (!!town.planner.want && diet.some(g => S.content.blueprints[town.planner.want!]?.output[g]));
    if (growers.length && !coming) tip('diet', `${town.name} eats nothing but bread: ${growers.length > 1 ? `${growers.slice(0, -1).join(', ')} or ${growers[growers.length - 1]}` : growers[0]} would vary its meals and lift its mood.`, '');
  }
  const noisy = S.buildings.filter(b => b.town === town.id && bp(S, b).homes && !b.site && inNuisance(S, ctr(b), b)).length;
  if (noisy > 0) tip('noise', `${noisy === 1 ? 'A home' : `${noisy} homes`} of ${town.name} ${noisy === 1 ? 'is' : 'are'} within a sawmill's noise: zone homes and workshops apart.`, String(noisy));
  // the price of density: homes packed in a district centre, unguarded against fire, burn along their rows
  if (S.hardship) {
    const packed = S.buildings.filter(b => b.town === town.id && !b.site && S.content.blueprints[b.type].homes && centreOf(S, town, b) && !guarded(S, b, 'fire')).length;
    const act = raise(town, 'fire');
    if (packed >= S.content.tuning.planner.packedHomes && act) tip('packed', `${packed} homes stand packed in ${town.name}'s centres with nothing to fight a fire: a fire there runs along their rows. Raise the priority of guarding against fire${encourageable(S, town, 'well') ? ', or encourage the Well' : ''}.`, `fire ${act.value}`, 1, act, raiseLabel(act, 'Guarding against fire'));
  }
  return out.sort((a, b) => b.score - a.score);
}

/**
 * The advisor, every `every_seconds`: each settlement's `tips` most pressing pieces of advice. A tip stays while it
 * holds, up to `hold_seconds`; once given it is not given again for `quiet_seconds` unless its grounds change (the
 * player raised the priority, another building has no room), so the same two tips do not stand for half an hour.
 */
export function updateAdvice(S: State) {
  const A = S.content.tuning.advisor;
  if (Math.floor(S.t) % A.everySeconds !== 0) return;
  for (const town of S.towns) {
    const kept: Tip[] = [];
    for (const c of adviceFor(S, town)) {
      if (kept.length >= A.tips) break;
      const was = town.advice.find(x => x.key === c.key);
      if (was && was.why === c.why && S.t - was.at < A.holdSeconds) { kept.push({ ...c, at: was.at }); continue; }
      const last = town.advised[c.key];
      if (last && last[1] === c.why && S.t - last[0] < A.quietSeconds) continue;
      town.advised[c.key] = [S.t, c.why];
      kept.push(c);
    }
    town.advice = kept;
  }
}

/** Up to `n` pieces of advice that hold for one settlement now, in words, most pressing first (what the advisor would give, before it weighs what it gave lately). */
export const advise = (S: State, town: Town, n = 3): string[] => adviceFor(S, town).slice(0, n).map(x => x.text);
