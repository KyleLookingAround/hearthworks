import { parseYaml, YamlError, type YamlMap } from './yaml.ts';

export interface Doc {
  /** Path inside the design bundle, e.g. `blueprints/house.md`. */
  path: string;
  data: YamlMap;
  body: string;
}

export class DocError extends Error {}

/** Split an OKF concept document into frontmatter and markdown body. */
export function parseDoc(path: string, raw: string): Doc {
  const text = raw.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const m = text.match(/^---\n([\s\S]*?)\n---[ \t]*(\n|$)/);
  if (!m) throw new DocError(`${path}: missing frontmatter (a --- block at the top of the file)`);
  let data;
  try {
    data = parseYaml(m[1]);
  } catch (e) {
    if (e instanceof YamlError) throw new DocError(`${path}: frontmatter ${e.message}`);
    throw e;
  }
  if (data === null || typeof data !== 'object' || Array.isArray(data)) throw new DocError(`${path}: frontmatter must be a mapping`);
  return { path, data, body: text.slice(m[0].length) };
}
