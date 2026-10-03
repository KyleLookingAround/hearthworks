/**
 * OKF v0.2 tooling for design/.
 *   npm run okf          check conformance, report broken links, regenerate index.md files
 *   npm run okf:check    same checks; fail if any index.md is out of date (CI)
 *
 * Conformance (spec section 11): every non-reserved .md has parseable
 * frontmatter with a non-empty `type`. Also checked here, as house rules:
 * actors use the `<producer>/<version>`, `human:` or `process:` convention,
 * timestamps carry a UTC offset, and status is draft | stable | deprecated.
 */
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { parseDoc, type Doc } from '../src/content/frontmatter.ts';
import { DESIGN_DIR } from '../src/content/node.ts';
import type { YamlValue } from '../src/content/yaml.ts';

const check = process.argv.includes('--check');
const errors: string[] = [], warnings: string[] = [];
const rel = (p: string) => relative(DESIGN_DIR, p).split(sep).join('/');

interface Entry { path: string; doc: Doc | null }
const entries: Entry[] = [];

function walk(dir: string) {
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { walk(p); continue; }
    if (!name.endsWith('.md')) continue;
    if (name === 'index.md' || name === 'log.md') { entries.push({ path: p, doc: null }); continue; }
    try {
      const doc = parseDoc(rel(p), readFileSync(p, 'utf8'));
      entries.push({ path: p, doc });
    } catch (e) { errors.push((e as Error).message); }
  }
}
walk(DESIGN_DIR);

const ACTOR = /^(human:|process:)[\w.@-]+$|^[\w.-]+\/[\w.-]+$/;
const STAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;
const asList = (v: YamlValue | undefined) => (Array.isArray(v) ? v : v ? [v] : []);

for (const { path, doc } of entries) {
  if (!doc) continue;
  const f = doc.data, where = doc.path;
  if (typeof f.type !== 'string' || !f.type.trim()) errors.push(`${where}: "type" is required (OKF 4.1)`);
  if (!f.description) warnings.push(`${where}: no description (index entries and search use it)`);
  if (f.status !== undefined && !['draft', 'stable', 'deprecated'].includes(String(f.status))) errors.push(`${where}: status must be draft, stable or deprecated`);
  const g = f.generated as Record<string, YamlValue> | undefined;
  if (g !== undefined) {
    if (typeof g !== 'object' || Array.isArray(g) || !g || typeof g.by !== 'string') errors.push(`${where}: generated needs { by, at }`);
    else {
      if (!ACTOR.test(g.by)) errors.push(`${where}: generated.by "${g.by}" is not an actor (OKF 7)`);
      if (g.at !== undefined && !STAMP.test(String(g.at))) errors.push(`${where}: generated.at needs an ISO 8601 time with offset`);
    }
  }
  for (const v of asList(f.verified)) {
    const m = v as Record<string, YamlValue>;
    if (!m || typeof m !== 'object' || typeof m.by !== 'string' || !ACTOR.test(m.by)) errors.push(`${where}: each verified entry needs an actor "by"`);
    else if (m.at !== undefined && !STAMP.test(String(m.at))) errors.push(`${where}: verified.at needs an ISO 8601 time with offset`);
  }
  if (f.stale_after !== undefined && !STAMP.test(String(f.stale_after))) errors.push(`${where}: stale_after needs an ISO 8601 time with offset`);
  if (f.type === 'Attested Computation') {
    if (!f.runtime) errors.push(`${where}: Attested Computation needs runtime (OKF 10.2)`);
    for (const k of ['computation', 'executor', 'attester'] as const) {
      const ref = k === 'computation' ? f[k] : (f[k] as Record<string, YamlValue> | undefined)?.resource;
      if (typeof ref !== 'string') { errors.push(`${where}: needs ${k === 'computation' ? 'computation' : `${k}.resource`}`); continue; }
      const target = ref.startsWith('/') ? join(DESIGN_DIR, ref) : resolve(dirname(path), ref);
      if (!existsSync(target)) errors.push(`${where}: ${k} points at missing ${ref}`);
    }
  }
  // links: OKF tolerates broken links (not-yet-written knowledge); we report them
  for (const m of doc.body.matchAll(/\]\(([^)\s]+)\)/g)) {
    const href = m[1].split('#')[0];
    if (!href || /^[a-z]+:/i.test(href)) continue;
    const target = href.startsWith('/') ? join(DESIGN_DIR, href) : resolve(dirname(path), href);
    if (!existsSync(target)) warnings.push(`${where}: link to ${href} has no target yet`);
  }
}

// ---- index.md generation (OKF 8) ----
function describeDir(dir: string): string {
  const titles = entries
    .filter(e => e.doc && dirname(e.path) === dir)
    .map(e => String(e.doc!.data.title ?? rel(e.path)));
  const subs = readdirSync(dir).filter(n => statSync(join(dir, n)).isDirectory());
  const files = readdirSync(dir).filter(n => !n.endsWith('.md') && statSync(join(dir, n)).isFile());
  const named = [...titles, ...files];
  const bits = [...named.slice(0, 4), ...(named.length > 4 ? [`${named.length - 4} more`] : []), ...subs.map(s => `${s}/`)];
  return bits.join(', ');
}

function indexFor(dir: string): string {
  const isRoot = dir === DESIGN_DIR;
  const docs = entries.filter(e => e.doc && dirname(e.path) === dir).sort((a, b) => a.path.localeCompare(b.path));
  const subs = readdirSync(dir).filter(n => statSync(join(dir, n)).isDirectory()).sort();
  const groups = new Map<string, Entry[]>();
  for (const e of docs) {
    const t = String(e.doc!.data.type);
    if (!groups.has(t)) groups.set(t, []);
    groups.get(t)!.push(e);
  }
  let out = isRoot ? '---\nokf_version: "0.2"\n---\n\n' : '';
  out += `<!-- Generated by \`npm run okf\`. Edit the concepts, not this file. -->\n\n`;
  for (const [type, list] of groups) {
    out += `# ${type}${list.length > 1 && !type.endsWith('s') ? 's' : ''}\n\n`;
    for (const e of list) {
      const f = e.doc!.data, name = e.path.slice(dir.length + 1);
      const status = f.status && f.status !== 'stable' ? ` (${f.status})` : '';
      out += `* [${String(f.title ?? name)}](${name})${status} - ${String(f.description ?? '').trim()}\n`;
    }
    out += '\n';
  }
  const extra = readdirSync(dir).filter(n => !n.endsWith('.md') && statSync(join(dir, n)).isFile()).sort();
  if (extra.length) {
    out += `# Files\n\n`;
    for (const n of extra) out += `* [${n}](${n})\n`;
    out += '\n';
  }
  if (subs.length) {
    out += `# Sections\n\n`;
    for (const s of subs) out += `* [${s}](${s}/) - ${describeDir(join(dir, s))}\n`;
    out += '\n';
  }
  if (isRoot && existsSync(join(dir, 'log.md'))) out += `# History\n\n* [Log](log.md) - Dated record of design changes, newest first\n`;
  return out.trimEnd() + '\n';
}

const stale: string[] = [];
function writeIndexes(dir: string) {
  const p = join(dir, 'index.md'), want = indexFor(dir);
  const have = existsSync(p) ? readFileSync(p, 'utf8') : null;
  if (have !== want) {
    if (check) stale.push(rel(p));
    else writeFileSync(p, want);
  }
  for (const n of readdirSync(dir).sort()) if (statSync(join(dir, n)).isDirectory()) writeIndexes(join(dir, n));
}
if (!errors.length) writeIndexes(DESIGN_DIR);

// ---- log.md shape (OKF 9) ----
for (const e of entries.filter(e => e.path.endsWith('log.md'))) {
  const text = readFileSync(e.path, 'utf8');
  const dates = [...text.matchAll(/^## (.+)$/gm)].map(m => m[1].trim());
  for (const d of dates) if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) errors.push(`${rel(e.path)}: date heading "${d}" must be YYYY-MM-DD`);
  if (dates.join() !== [...dates].sort().reverse().join()) errors.push(`${rel(e.path)}: entries must be newest first`);
}

const concepts = entries.filter(e => e.doc).length;
for (const w of warnings) console.log(`warn   ${w}`);
for (const e of errors) console.log(`error  ${e}`);
if (stale.length) console.log(`error  index.md out of date (run npm run okf): ${stale.join(', ')}`);
console.log(`${concepts} concepts, ${errors.length} errors, ${warnings.length} warnings${check ? '' : ', indexes up to date'}`);
process.exit(errors.length || stale.length ? 1 : 0);
