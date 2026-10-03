/**
 * Run roadmap gates headless.
 *   npm run gates                       all gates
 *   npm run gates -- 02-sustain-town    one gate
 *   npm run gates -- 02 --seed 7 --seconds 600 --json
 * Deprecated gates are skipped in the full run but can still be run by name.
 */
import { listGates, runGate } from '../src/gates/executor.ts';

const args = process.argv.slice(2);
const json = args.includes('--json');
const overrides: Record<string, number> = {};
const names: string[] = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--json') continue;
  if (a.startsWith('--')) { overrides[a.slice(2)] = Number(args[++i]); continue; }
  names.push(a);
}

const gates = listGates({ deprecated: names.length > 0 }).filter(p => !names.length || names.some(n => p.replace(/^.*[\\/]/, '').startsWith(n)));
if (!gates.length) { console.error(`No gate matches ${names.join(', ')}`); process.exit(2); }

let failed = 0;
for (const path of gates) {
  const r = await runGate(path, overrides);
  if (!r.verdict.ok) failed++;
  console.log(`${r.verdict.ok ? 'PASS' : 'FAIL'}  ${r.id}  (${r.ms} ms, seed ${r.receipt.params.seed})`);
  for (const c of r.verdict.checks) console.log(`      ${c.ok ? 'ok  ' : 'MISS'} ${c.metric} = ${c.got} (want ${c.want})`);
  if (r.verdict.reason && !r.verdict.checks.length) console.log(`      ${r.verdict.reason}`);
  if (json) console.log(JSON.stringify(r.receipt, null, 2));
}
process.exit(failed ? 1 : 0);
