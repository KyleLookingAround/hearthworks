/**
 * The steward's side of the game: the chronicle as an OKF log, and an advisor that reads the
 * chronicle and the planners to point the player at a lever. Pure reads of the state.
 */
import { homesInNuisance } from './surroundings.ts';
import { NEED_TEXT, ageNeeded, knows, pressure, scholarly } from './knowledge.ts';
import { dietOf } from './farms.ts';
import { defence, guarded } from './hardship.ts';
import { centreOf } from './planner.ts';
import { learningAt, seasonOf, storesOnTrack } from './world.ts';
import type { State, Town } from './types.ts';

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

/** What a settlement lacks for scholars at work: a scholar at its university, the university itself, or the idea of one. */
function universityHint(S: State, town: Town): string {
  if (S.buildings.some(b => b.town === town.id && !b.site && S.content.blueprints[b.type].learning === 'university')) return 'its University needs a scholar at work';
  if (knows(town, 'university')) return `build a University (its planner builds one in a town, or in a village of ${S.content.tuning.knowledge.universityVillagers} with a library that makes what it is built of)`;
  return 'encourage the University';
}

/**
 * Up to `n` suggestions for one settlement, most pressing first: hunger, a need nothing known answers
 * (encourage the blueprint that would), an idea only scholars find with no university at work, no room (zones), raiders who outnumber the defence, a winter store
 * fallen behind (ration), the hungry kept from leaving, long hauls with no carts thought of or oxen without feed,
 * a diet of bread alone, noisy homes, homes packed in a centre with nothing to fight a fire, what was lately pulled down
 * or moved out of a centre, then the latest page of history.
 */
export function advise(S: State, town: Town, n = 3): string[] {
  const out: string[] = [], status = town.planner.status;
  if (town.fed < 0.8) out.push(`${town.name} is going hungry: raise the priority of bread.`);
  const stuck = /^Nothing the \w+ knows would help: (.*)$/.exec(status);
  if (stuck) {
    const need = Object.entries(NEED_TEXT).find(([, text]) => text === stuck[1])?.[0];
    // an answer it can think of at its age first; one a later age opens says which
    const answers = need ? Object.values(S.content.blueprints).filter(B => B.discovery?.need === need && !knows(town, B.id)) : [];
    const answer = answers.find(B => ageNeeded(S, B.id) <= town.age) ?? answers[0];
    if (answer?.discovery?.university && !learningAt(S, town.id, 'university')) out.push(`Nobody in ${town.name} has an answer to "${stuck[1]}": only scholars think of the ${answer.name}, ${universityHint(S, town)}.`);
    else if (answer && ageNeeded(S, answer.id) > town.age) out.push(`Nobody in ${town.name} has an answer to "${stuck[1]}": the ${answer.name} comes to a settlement of the Age of ${S.content.eras[ageNeeded(S, answer.id)].name}, or from a neighbour who knows it.`);
    else if (answer) out.push(`Nobody in ${town.name} has an answer to "${stuck[1]}": encourage them to think of the ${answer.name}.`);
  }
  // an idea only scholars find, pressing here, with no university at work to find it
  const K = S.content.tuning.knowledge, waiting = !stuck && scholarly(S, town).find(x => x.waits === 'university' && !x.missing.length && pressure(S, town, x.B.discovery!.need) >= K.struggleSeverity * K.universityThreshold);
  if (waiting) out.push(`Scholars would think of the ${waiting.B.name} for ${town.name}, as ${NEED_TEXT[waiting.B.discovery!.need] ?? waiting.B.discovery!.need}: ${universityHint(S, town)}.`);
  const room = /^No (room|place) for (.*?): (.*)$/.exec(status);
  if (room) out.push(`${town.name} has no ${room[1]} for ${room[2]} (${room[3]}): paint a zone where there is room, or lift no-build land.`);
  // hard times: raiders who outnumber the defence (a camp it sends bread to leaves it be), a winter store fallen behind, the hungry kept from leaving
  if (S.hardship) {
    const yard = S.bmap.get(town.store), reach = S.content.tuning.hardship.raidReach;
    const threat = yard ? Math.max(0, ...S.camps.filter(c => !(c.friend === town.id && c.goodwill > 0) && Math.hypot(c.x - yard.x, c.y - yard.y) <= reach).map(c => Math.floor(c.strength))) : 0;
    if (threat > defence(S, town).total) out.push(`Raiders camped within reach of ${town.name} outnumber its defence: raise the priority of defence against raiders${knows(town, 'watchtower') ? '' : ', or encourage the Watchtower'}.`);
  }
  const season = seasonOf(S);
  if ((season === 'summer' || season === 'autumn') && !storesOnTrack(S, town) && !town.laws.rationing) out.push(`${town.name}'s store for the winter has fallen behind: ration food before the frost.`);
  if (!town.laws.leave && town.fed < 1) out.push(`The hungry of ${town.name} may not leave, and may starve: let them go, or ration food.`);
  // long hauls: carts to think of or to feed, and with farms that grow, a diet of bread alone
  if (S.carts) {
    const tiles = Math.round(town.reach), barns = S.buildings.filter(b => b.town === town.id && !b.site && S.content.blueprints[b.type].oxen);
    if (pressure(S, town, 'distance') >= 1 && !knows(town, 'cart_shed')) out.push(`${town.name}'s deliveries go ${tiles} tiles on average: encourage the Cart Shed.`);
    else if (pressure(S, town, 'long_hauls') >= 1 && knows(town, 'cart_shed') && !knows(town, 'ox_barn')) out.push(`${town.name}'s carts go ${tiles} tiles on average: encourage the Ox Barn.`);
    const feed = S.content.tuning.logistics.oxFeed;
    if (barns.length && barns.every(b => Object.keys(S.content.blueprints[b.type].keepStocked).some(g => (b.inv[g] || 0) < feed))) out.push(`The oxen of ${town.name} wait for wheat: raise the priority of bread, or of hauling.`);
  }
  if (S.farms && S.buildings.filter(b => b.town === town.id && !b.site && S.content.blueprints[b.type].homes).length >= 4 && !dietOf(S, town.id).size) out.push(`${town.name} eats nothing but bread: a Garden, an Orchard or a Pasture would vary its meals and lift its mood.`);
  if (homesInNuisance(S) > 0) out.push('Some homes are within a sawmill\'s noise: zone homes and workshops apart.');
  // the price of density: homes packed in a district centre, unguarded against fire, burn along their rows
  if (S.hardship) {
    const packed = S.buildings.filter(b => b.town === town.id && !b.site && S.content.blueprints[b.type].homes && centreOf(S, town, b) && !guarded(S, b, 'fire')).length;
    if (packed >= S.content.tuning.planner.packedHomes) out.push(`${packed} homes stand packed in ${town.name}'s centres with nothing to fight a fire: a fire there runs along their rows. Raise the priority of guarding against fire${knows(town, 'well') ? '' : ', or encourage the Well'}.`);
  }
  // renewal: what the settlement lately pulled down or moved, and why
  const renewed = [...S.chronicle].reverse().find(c => c.town === town.id && (c.kind === 'pulled' || c.kind === 'moved') && S.t - c.t <= S.content.tuning.planner.renewEverySeconds);
  if (renewed) out.push(`Renewing: ${renewed.text}.`);
  // the latest page of history worth reading: not the founding, nor the turn of a season
  const last = [...S.chronicle].reverse().find(c => c.town === town.id && c.kind !== 'founded' && c.kind !== 'season');
  if (last && last !== renewed) out.push(`Latest: ${last.text}.`);
  return out.slice(0, n);
}
