---
type: Decision
title: "0003: Plain TypeScript, no bundler yet"
description: The browser build is tsc output served as ES modules; tests use Node's built-in runner. Vite can come in later without changing the code.
tags: [decision, tooling]
status: stable
generated: { by: claude/opus-5.5, at: 2026-10-03T08:15:00Z }
---

# Decision

`tsc` compiles `src/` to ES modules in `site/js`; `static/` and a compiled `content.json` complete the site. Tests run on `node --test` with Node's built-in TypeScript type stripping. TypeScript is the only dependency.

# Why

- The first setup session could not reach the npm registry, so Vite and Vitest were unavailable.
- Zero runtime dependencies keeps the build fast and the repo easy to reason about.
- Imports use `.ts` extensions, which tsc rewrites to `.js`, so adding Vite later needs no code changes.

# Revisit when

- The UI needs hot module reload, or
- Asset handling (sprites, audio) outgrows copying `static/`.
