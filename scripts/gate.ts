/**
 * Run roadmap gates headless.
 *   npm run gates                       all gates
 *   npm run gates -- 02-sustain-town    one gate
 *   npm run gates -- 02 --seed 7 --seconds 600 --json
 *   npm run gates -- 04 --map islands --size large
 * Deprecated gates are skipped in the full run but can still be run by name.
 */
import { listGates, reportLines, runGate } from '../src/gates/executor.ts';

const args = process.argv.slice(2);
const json = args.includes('--json');
const overrides: Record<string, number | string> = {};
const names: string[] = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--json') continue;
  // numbers stay numbers; anything else (a map type or size) is a word
  if (a.startsWith('--')) { const v = args[++i]; overrides[a.slice(2)] = v !== '' && Number.isFinite(Number(v)) ? Number(v) : v; continue; }
  names.push(a);
}

const gates = listGates({ deprecated: names.length > 0 }).filter(p => !names.length || names.some(n => p.replace(/^.*[\\/]/, '').startsWith(n)));
if (!gates.length) { console.error(`No gate matches ${names.join(', ')}`); process.exit(2); }

let failed = 0;
for (const path of gates) {
  const r = await runGate(path, overrides);
  if (!r.verdict.ok) failed++;
  for (const line of reportLines(r)) console.log(line);
  if (json) console.log(JSON.stringify(r.receipt, null, 2));
}
process.exit(failed ? 1 : 0);
