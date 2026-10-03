/**
 * The steward's side of the game: the chronicle as an OKF log, and an advisor that reads the
 * chronicle and the planners to point the player at a lever. Pure reads of the state.
 */
import { homesInNuisance } from './surroundings.ts';
import { NEED_TEXT, knows } from './knowledge.ts';
import type { State, Town } from './types.ts';

/** OKF log labels for each kind of chronicle line. */
const LABEL: Record<string, string> = {
  founded: 'Creation', invented: 'Creation', district: 'Creation', bridge: 'Creation',
  form: 'Update', replanned: 'Update', taught: 'Update', learned: 'Update', proven: 'Update', season: 'Update', trade: 'Creation', birth: 'Creation', custom: 'Update', settled: 'Creation',
  forgotten: 'Deprecation',
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

/**
 * Up to `n` suggestions for one settlement, most pressing first: hunger, a need nothing known answers
 * (encourage the blueprint that would), no room (zones), noisy homes, then the latest page of history.
 */
export function advise(S: State, town: Town, n = 3): string[] {
  const out: string[] = [], status = town.planner.status;
  if (town.fed < 0.8) out.push(`${town.name} is going hungry: raise the priority of bread.`);
  const stuck = /^Nothing the \w+ knows would help: (.*)$/.exec(status);
  if (stuck) {
    const need = Object.entries(NEED_TEXT).find(([, text]) => text === stuck[1])?.[0];
    const answer = need && Object.values(S.content.blueprints).find(B => B.discovery?.need === need && !knows(town, B.id));
    if (answer) out.push(`Nobody in ${town.name} has an answer to "${stuck[1]}": encourage them to think of the ${answer.name}.`);
  }
  if (/^No (room|place) for/.test(status)) out.push(`${town.name} ${status.charAt(0).toLowerCase()}${status.slice(1)}: paint a zone where there is room, or lift no-build land.`);
  if (homesInNuisance(S) > 0) out.push('Some homes are within a sawmill\'s noise: zone homes and workshops apart.');
  const last = [...S.chronicle].reverse().find(c => c.town === town.id && c.kind !== 'founded');
  if (last) out.push(`Latest: ${last.text}.`);
  return out.slice(0, n);
}
