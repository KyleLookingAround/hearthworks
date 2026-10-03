/**
 * Deterministic attester for gates with `runtime: hearthworks-sim`.
 *
 * Checks two things about a receipt produced by the gate executor
 * (see /references/skills/run-gate.md):
 *
 *   1. Provenance: the scenario that ran is the sanctioned one. The SHA-256
 *      of the scenario file named by the gate's `computation` must equal
 *      `receipt.scenario_sha256`, so an edited or swapped scenario fails.
 *   2. Thresholds: every `pass_when` entry holds against `receipt.metrics`.
 *      `min_<metric>: n` needs metric >= n; `max_<metric>: n` needs metric <= n.
 *
 * No LLM, no network, no randomness. Safe to run anywhere.
 */
import { createHash } from 'node:crypto';

export interface Receipt {
  gate: string;
  params: Record<string, number | string>;
  ticks: number;
  scenario_sha256: string;
  content_hash: string;
  metrics: Record<string, number>;
}

export interface Check { rule: string; metric: string; want: string; got: number | null; ok: boolean }
export interface Verdict { ok: boolean; reason: string | null; checks: Check[] }

export const sha256 = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');

export function attest(
  gate: { id: string; passWhen: Record<string, number>; computationSource: string },
  receipt: Receipt,
): Verdict {
  if (receipt.gate !== gate.id) return { ok: false, reason: `receipt is for ${receipt.gate}, not ${gate.id}`, checks: [] };
  if (sha256(gate.computationSource) !== receipt.scenario_sha256) {
    return { ok: false, reason: 'scenario file does not match the receipt: the sanctioned computation did not run', checks: [] };
  }
  const rules = Object.entries(gate.passWhen);
  if (!rules.length) return { ok: false, reason: 'gate has no pass_when rules', checks: [] };
  const checks: Check[] = rules.map(([rule, n]) => {
    const m = rule.match(/^(min|max)_(.+)$/);
    if (!m) return { rule, metric: rule, want: '?', got: null, ok: false };
    const [, kind, metric] = m;
    const got = metric in receipt.metrics ? receipt.metrics[metric] : null;
    const ok = got !== null && (kind === 'min' ? got >= n : got <= n);
    return { rule, metric, want: `${kind === 'min' ? '>=' : '<='} ${n}`, got, ok };
  });
  const failed = checks.filter(c => !c.ok);
  return {
    ok: failed.length === 0,
    reason: failed.length ? failed.map(c => `${c.metric} ${c.got === null ? 'missing' : c.got} (want ${c.want})`).join('; ') : null,
    checks,
  };
}
