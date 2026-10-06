/**
 * Behaviour fingerprint for refactors: run default new games (as src/ui/app.ts newGame() makes them) and hash the full save (but for the hash of the content it was made with).
 *   npm run fingerprint -- [seconds=600] [seeds=1,2,3] [--resume]   (prints one line per seed)
 * Compare the output before and after a refactor: any difference in any seed means behaviour changed.
 * --resume also saves at half time, loads, and checks the loaded copy ends identical to the uninterrupted run.
 */
import { createHash } from 'node:crypto';
import { loadContent } from '../src/content/node.ts';
import { runFor, saveGame, loadGame, type State } from '../src/sim/index.ts';
import { newGame as defaultGame, newGameOptions } from '../src/gates/kit.ts';

const args = process.argv.slice(2).filter(a => !a.startsWith('--'));
const seconds = Number(args[0] ?? 600), seeds = (args[1] ?? '1,2,3').split(',').map(Number), resume = process.argv.includes('--resume');
const content = loadContent();
// as NewGameDialog defaults (the gate kit's builder, which Gate 25 runs too)
const { map, size } = newGameOptions(content);
const newGame = (seed: number) => defaultGame(content, seed);
// the save without the hash of the content it was made with, which any edit to the design's prose changes
const text = (S: State) => { const j = saveGame(S) as unknown as Record<string, unknown>; delete j.content; return JSON.stringify(j); };
const full = (S: State) => JSON.stringify(saveGame(S));
const hash = (s: string) => createHash('sha256').update(s).digest('hex').slice(0, 16);
// the save minus the machine-work counters (world.work), which a resumed game may count differently
const noWork = (s: string) => { const j = JSON.parse(s); delete j.state.world.work; return JSON.stringify(j); };

for (const seed of seeds) {
  const t0 = performance.now();
  const S = newGame(seed);
  let R: State | null = null;
  if (resume) { runFor(S, seconds / 2); R = loadGame(content, full(S)); runFor(S, seconds / 2); runFor(R, seconds / 2); }
  else runFor(S, seconds);
  const ms = Math.round(performance.now() - t0), out = text(S);
  const pop = S.agents.filter(a => a.kind === 'villager').length;
  let line = `seed ${seed} ${map}/${size} t=${S.t.toFixed(1)} save=${hash(out)} sans-work=${hash(noWork(out))} work=${JSON.stringify(S.world.work)} towns=${S.towns.length} villagers=${pop} buildings=${S.buildings.length} ms=${ms}`;
  if (R) { const r = text(R); line += ` resume=${r === out ? 'identical' : noWork(r) === noWork(out) ? 'identical-except-work' : 'DIFFERENT'} rwork=${JSON.stringify(R.world.work)}`; }
  console.log(line);
}
