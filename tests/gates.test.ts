/** Every roadmap gate in design/gates runs headless and must attest cleanly. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { listGates, runGate } from '../src/gates/executor.ts';
import { attest } from '../design/references/attesters/thresholds.ts';

for (const path of listGates()) {
  const id = path.replace(/^.*[\\/]/, '').replace(/\.md$/, '');
  test(`gate ${id}`, async () => {
    const r = await runGate(path);
    const detail = r.verdict.checks.map(c => `${c.ok ? 'ok' : 'MISS'} ${c.metric}=${c.got} (want ${c.want})`).join(', ');
    assert.ok(r.verdict.ok, `${id} failed: ${r.verdict.reason}\n${detail}`);
  });
}

test('the attester rejects a receipt from an edited scenario', async () => {
  const path = listGates()[0];
  const r = await runGate(path);
  const scenario = readFileSync(new URL('../design/references/scenarios/first-plank.ts', import.meta.url), 'utf8');
  const v = attest({ id: r.id, passWhen: { min_planks_made: 1 }, computationSource: scenario + '\n// tweak' }, r.receipt);
  assert.equal(v.ok, false);
  assert.match(v.reason ?? '', /sanctioned computation did not run/);
});

test('the attester reports a missing metric', async () => {
  const r = await runGate(listGates()[0]);
  const scenario = readFileSync(new URL('../design/references/scenarios/first-plank.ts', import.meta.url), 'utf8');
  const v = attest({ id: r.id, passWhen: { min_unicorns: 1 }, computationSource: scenario }, r.receipt);
  assert.equal(v.ok, false);
  assert.match(v.reason ?? '', /unicorns missing/);
});
