/**
 * Every roadmap gate in design/gates runs headless and must attest cleanly. The gates run
 * side by side, each in its own worker thread, and print the gate report as they finish.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { availableParallelism, tmpdir } from 'node:os';
import { Worker } from 'node:worker_threads';
import { join } from 'node:path';
import { listGates, reportLines, runGate, type GateRun } from '../src/gates/executor.ts';
import { attest } from '../design/references/attesters/thresholds.ts';

const inWorker = (path: string) => new Promise<GateRun>((done, fail) => {
  const w = new Worker(new URL('./gate-worker.ts', import.meta.url), { workerData: path });
  w.once('message', done);
  w.once('error', fail);
  w.once('exit', code => fail(new Error(`gate worker for ${path} exited with code ${code}`)));
});

describe('roadmap gates', { concurrency: Math.max(1, availableParallelism()) }, () => {
  for (const path of listGates()) {
    const id = path.replace(/^.*[\\/]/, '').replace(/\.md$/, '');
    test(`gate ${id}`, async t => {
      const r = await inWorker(path);
      for (const line of reportLines(r)) t.diagnostic(line);
      const detail = r.verdict.checks.map(c => `${c.ok ? 'ok' : 'MISS'} ${c.metric}=${c.got} (want ${c.want})`).join(', ');
      assert.ok(r.verdict.ok, `${id} failed: ${r.verdict.reason}\n${detail}`);
    });
  }
});

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

test('deprecated gates are kept but left out of the run unless asked for', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gates-'));
  const gate = (status: string) => `---\ntype: Attested Computation\ntitle: g\nstatus: ${status}\n---\n`;
  writeFileSync(join(dir, '01-old.md'), gate('deprecated'));
  writeFileSync(join(dir, '02-new.md'), gate('stable'));
  writeFileSync(join(dir, 'index.md'), '# index');
  assert.deepEqual(listGates({ dir }).map(p => p.replace(/^.*[\\/]/, '')), ['02-new.md']);
  assert.equal(listGates({ dir, deprecated: true }).length, 2);
});
