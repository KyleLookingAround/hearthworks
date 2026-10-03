/**
 * Node-only gate executor. Reads a gate concept (type: Attested Computation),
 * runs its sanctioned scenario headless and returns a receipt, then hands the
 * receipt to the gate's attester for a verdict.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseDoc } from '../content/frontmatter.ts';
import { DESIGN_DIR, loadContent } from '../content/node.ts';
import { STEP } from '../sim/index.ts';
import type { YamlMap } from '../content/yaml.ts';
import type { GateParams, Scenario } from './kit.ts';

export interface Receipt {
  gate: string;
  params: Record<string, number | string>;
  ticks: number;
  scenario_sha256: string;
  content_hash: string;
  metrics: Record<string, number>;
}
export interface Verdict { ok: boolean; reason: string | null; checks: { rule: string; metric: string; want: string; got: number | null; ok: boolean }[] }
export interface GateRun { id: string; title: string; path: string; receipt: Receipt; verdict: Verdict; ms: number }

const GATES_DIR = join(DESIGN_DIR, 'gates');

/**
 * Gate concepts in design/gates, in order. Deprecated gates (superseded by a reworked
 * gate, kept for history) are left out unless asked for.
 */
export function listGates(opts: { deprecated?: boolean; dir?: string } = {}): string[] {
  const dir = opts.dir ?? GATES_DIR;
  return readdirSync(dir).filter(f => f.endsWith('.md') && f !== 'index.md' && f !== 'log.md').sort().map(f => join(dir, f))
    .filter(p => opts.deprecated || parseDoc(p, readFileSync(p, 'utf8')).data.status !== 'deprecated');
}

/** Resolve an OKF path-valued field: bundle-relative (/...), relative, or absolute URL. */
function resolvePath(fromFile: string, p: string): string {
  if (/^https?:/.test(p)) throw new Error(`remote resources are not supported: ${p}`);
  return p.startsWith('/') ? join(DESIGN_DIR, p) : resolve(dirname(fromFile), p);
}

export async function runGate(path: string, overrides: Partial<GateParams> = {}): Promise<GateRun> {
  const doc = parseDoc(path, readFileSync(path, 'utf8'));
  const f = doc.data, id = path.replace(/^.*[\\/]/, '').replace(/\.md$/, '');
  if (f.type !== 'Attested Computation') throw new Error(`${id}: not an Attested Computation`);
  if (f.runtime !== 'hearthworks-sim') throw new Error(`${id}: unsupported runtime ${String(f.runtime)}`);
  if (typeof f.computation !== 'string') throw new Error(`${id}: needs a computation path`);
  const attester = (f.attester as YamlMap | null)?.resource;
  if (typeof attester !== 'string') throw new Error(`${id}: needs attester.resource`);

  const params = { ...(f.defaults as Record<string, number | string> ?? {}), ...overrides } as GateParams;
  for (const p of (f.parameters as YamlMap[] ?? [])) {
    if (p.required && !(String(p.name) in params)) throw new Error(`${id}: parameter ${String(p.name)} is required`);
  }

  const scenarioPath = resolvePath(path, f.computation);
  const scenarioSource = readFileSync(scenarioPath, 'utf8');
  const mod = await import(pathToFileURL(scenarioPath).href) as { run: Scenario };
  const att = await import(pathToFileURL(resolvePath(path, attester)).href) as {
    sha256: (s: string) => string;
    attest: (g: { id: string; passWhen: Record<string, number>; computationSource: string }, r: Receipt) => Verdict;
  };

  const content = loadContent();
  const t0 = performance.now();
  const { state, metrics } = mod.run(content, params);
  const receipt: Receipt = {
    gate: id, params, ticks: Math.round(state.t / STEP),
    scenario_sha256: att.sha256(scenarioSource), content_hash: content.hash, metrics,
  };
  const verdict = att.attest({ id, passWhen: (f.pass_when as Record<string, number>) ?? {}, computationSource: scenarioSource }, receipt);
  return { id, title: String(f.title ?? id), path, receipt, verdict, ms: Math.round(performance.now() - t0) };
}
