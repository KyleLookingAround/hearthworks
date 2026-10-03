/**
 * A small, strict YAML reader for design-bundle frontmatter.
 *
 * Supports the subset the bundle uses: block mappings, block sequences
 * (including `- key: value` items), flow mappings `{ a: 1 }` and flow
 * sequences `[a, b]` (which may span lines), quoted and plain scalars,
 * numbers, booleans, null and `#` comments.
 *
 * Anything outside the subset (anchors, tags, `|` / `>` block scalars,
 * multi-document streams) throws a YamlError with a line number, so a
 * file never parses into something different from what a full YAML parser
 * would produce. Every file that parses here is valid YAML.
 */

export type YamlValue = string | number | boolean | null | YamlValue[] | { [k: string]: YamlValue };
export type YamlMap = { [k: string]: YamlValue };

export class YamlError extends Error {
  line: number;
  constructor(msg: string, line: number) {
    super(`line ${line}: ${msg}`);
    this.line = line;
  }
}

interface Line { n: number; indent: number; text: string }

export function parseYaml(src: string): YamlValue {
  const lines: Line[] = [];
  src.replace(/\r\n?/g, '\n').split('\n').forEach((raw, i) => {
    if (/^\s*(#.*)?$/.test(raw)) return;
    if (/\t/.test(raw.match(/^\s*/)![0])) throw new YamlError('tabs are not allowed for indentation', i + 1);
    const indent = raw.length - raw.trimStart().length;
    lines.push({ n: i + 1, indent, text: raw.trim() });
  });
  if (!lines.length) return null;
  if (lines[0].text === '---' || lines[0].text.startsWith('--- ')) throw new YamlError('multi-document streams are not supported', lines[0].n);
  const p = { lines, i: 0 };
  const v = parseBlock(p, lines[0].indent);
  if (p.i < lines.length) throw new YamlError(`unexpected indentation`, lines[p.i].n);
  return v;
}

interface Cursor { lines: Line[]; i: number }

function parseBlock(p: Cursor, indent: number): YamlValue {
  const first = p.lines[p.i];
  if (isSeqItem(first.text)) return parseSeq(p, indent);
  return parseMap(p, indent);
}

const isSeqItem = (t: string) => t === '-' || t.startsWith('- ');

function parseSeq(p: Cursor, indent: number): YamlValue[] {
  const out: YamlValue[] = [];
  while (p.i < p.lines.length) {
    const ln = p.lines[p.i];
    if (ln.indent < indent) break;
    if (ln.indent > indent) throw new YamlError('unexpected indentation in list', ln.n);
    if (!isSeqItem(ln.text)) break;
    const rest = ln.text === '-' ? '' : ln.text.slice(2).trim();
    if (!rest) {
      p.i++;
      const next = p.lines[p.i];
      if (next && next.indent > indent) out.push(parseBlock(p, next.indent));
      else out.push(null);
    } else if (splitKey(rest) && !/^[{\["']/.test(rest)) {
      // `- key: value` starts a mapping whose keys sit two columns in
      const childIndent = indent + (ln.text.length - ln.text.slice(1).trimStart().length);
      p.lines[p.i] = { n: ln.n, indent: childIndent, text: rest };
      out.push(parseMap(p, childIndent));
    } else {
      p.i++;
      out.push(parseInline(p, rest, ln.n));
    }
  }
  return out;
}

function splitKey(t: string): [string, string] | null {
  let key: string, rest: string;
  if (t[0] === '"' || t[0] === "'") {
    const q = t[0];
    let j = 1;
    while (j < t.length && t[j] !== q) { if (t[j] === '\\' && q === '"') j++; j++; }
    if (t[j + 1] !== ':') return null;
    key = unquote(t.slice(0, j + 1), 0);
    rest = t.slice(j + 2);
  } else {
    const m = t.match(/^([^:#{}\[\],"'][^:#{}\[\],]*?)\s*:(\s+|$)/);
    if (!m) return null;
    key = m[1].trim();
    rest = t.slice(m[0].length);
  }
  return [key, rest.trim()];
}

function parseMap(p: Cursor, indent: number): YamlMap {
  const out: YamlMap = {};
  while (p.i < p.lines.length) {
    const ln = p.lines[p.i];
    if (ln.indent < indent) break;
    if (ln.indent > indent) throw new YamlError('unexpected indentation', ln.n);
    if (isSeqItem(ln.text)) break;
    const kv = splitKey(ln.text);
    if (!kv) throw new YamlError(`expected "key: value", got "${ln.text}"`, ln.n);
    const [key, rest] = kv;
    if (key in out) throw new YamlError(`duplicate key "${key}"`, ln.n);
    p.i++;
    if (rest === '' || rest.startsWith('#')) {
      const next = p.lines[p.i];
      if (next && (next.indent > indent || (next.indent === indent && isSeqItem(next.text)))) out[key] = parseBlock(p, next.indent);
      else out[key] = null;
    } else {
      out[key] = parseInline(p, rest, ln.n);
    }
  }
  return out;
}

function parseInline(p: Cursor, text: string, n: number): YamlValue {
  if (/^[|>][-+0-9]*\s*(#.*)?$/.test(text)) throw new YamlError('block scalars (| and >) are not supported; use a quoted string', n);
  if (/^[&*!]/.test(text)) throw new YamlError('anchors, aliases and tags are not supported', n);
  if (text[0] === '{' || text[0] === '[') {
    let src = text;
    while (!balanced(src)) {
      const next = p.lines[p.i];
      if (!next) throw new YamlError('unclosed flow collection', n);
      src += ' ' + next.text; p.i++;
    }
    const f = { s: src, i: 0, n };
    const v = flowValue(f);
    skipWs(f);
    if (f.i < f.s.length && f.s[f.i] !== '#') throw new YamlError(`unexpected text after collection: "${f.s.slice(f.i)}"`, n);
    return v;
  }
  return scalar(stripComment(text), n);
}

function balanced(s: string): boolean {
  let depth = 0, q = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === '\\' && q === '"') i++; else if (c === q) q = ''; continue; }
    if (c === '"' || c === "'") q = c;
    else if (c === '{' || c === '[') depth++;
    else if (c === '}' || c === ']') depth--;
    else if (c === '#' && depth === 0) break;
  }
  return depth <= 0;
}

function stripComment(s: string): string {
  let q = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === '\\' && q === '"') i++; else if (c === q) q = ''; continue; }
    if ((c === '"' || c === "'") && i === 0) q = c;
    else if (c === '#' && (i === 0 || /\s/.test(s[i - 1]))) return s.slice(0, i).trim();
  }
  return s.trim();
}

function unquote(s: string, n: number): string {
  const q = s[0];
  if (s[s.length - 1] !== q || s.length < 2) throw new YamlError(`unterminated string ${s}`, n);
  const body = s.slice(1, -1);
  if (q === "'") return body.replace(/''/g, "'");
  return body.replace(/\\(.)/g, (_, c: string) => ({ n: '\n', t: '\t', '"': '"', '\\': '\\', '/': '/' } as Record<string, string>)[c] ?? c);
}

function scalar(s: string, n: number): YamlValue {
  if (s === '') return null;
  if (s[0] === '"' || s[0] === "'") return unquote(s, n);
  if (s === 'null' || s === '~') return null;
  if (s === 'true') return true;
  if (s === 'false') return false;
  if (/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(s)) return Number(s);
  if (/^0x[0-9a-fA-F]+$/.test(s)) return parseInt(s, 16);
  if (/: /.test(s) || s.endsWith(':')) throw new YamlError(`plain value contains ": " — quote it: ${s}`, n);
  return s;
}

interface Flow { s: string; i: number; n: number }
const skipWs = (f: Flow) => { while (f.i < f.s.length && /\s/.test(f.s[f.i])) f.i++; };

function flowValue(f: Flow): YamlValue {
  skipWs(f);
  const c = f.s[f.i];
  if (c === '{') {
    f.i++;
    const out: YamlMap = {};
    for (;;) {
      skipWs(f);
      if (f.s[f.i] === '}') { f.i++; return out; }
      const key = flowKey(f);
      skipWs(f);
      if (f.s[f.i] !== ':') throw new YamlError(`expected ":" after key "${key}"`, f.n);
      f.i++;
      skipWs(f);
      out[key] = (f.s[f.i] === ',' || f.s[f.i] === '}') ? null : flowValue(f);
      skipWs(f);
      if (f.s[f.i] === ',') { f.i++; continue; }
      if (f.s[f.i] === '}') { f.i++; return out; }
      throw new YamlError(`expected "," or "}" in mapping`, f.n);
    }
  }
  if (c === '[') {
    f.i++;
    const out: YamlValue[] = [];
    for (;;) {
      skipWs(f);
      if (f.s[f.i] === ']') { f.i++; return out; }
      out.push(flowValue(f));
      skipWs(f);
      if (f.s[f.i] === ',') { f.i++; continue; }
      if (f.s[f.i] === ']') { f.i++; return out; }
      throw new YamlError(`expected "," or "]" in list`, f.n);
    }
  }
  if (c === '"' || c === "'") return unquote(readQuoted(f), f.n);
  const start = f.i;
  while (f.i < f.s.length && !',]}'.includes(f.s[f.i])) f.i++;
  return scalar(f.s.slice(start, f.i).trim(), f.n);
}

function readQuoted(f: Flow): string {
  const q = f.s[f.i], start = f.i;
  f.i++;
  while (f.i < f.s.length && f.s[f.i] !== q) { if (f.s[f.i] === '\\' && q === '"') f.i++; f.i++; }
  if (f.i >= f.s.length) throw new YamlError('unterminated string', f.n);
  f.i++;
  return f.s.slice(start, f.i);
}

function flowKey(f: Flow): string {
  const c = f.s[f.i];
  if (c === '"' || c === "'") return unquote(readQuoted(f), f.n);
  const start = f.i;
  while (f.i < f.s.length && !':,{}[]'.includes(f.s[f.i])) f.i++;
  const k = f.s.slice(start, f.i).trim();
  if (!k) throw new YamlError('empty key in mapping', f.n);
  return k;
}
