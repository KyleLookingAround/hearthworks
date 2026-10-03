---
type: Skill
title: Run a gate
description: How to run a hearthworks-sim gate headless and get its receipt and verdict.
tags: [gate, tooling]
status: stable
generated: { by: claude/opus-5.5, at: 2026-10-03T10:41:51Z }
---

# Steps

1. `npm run gates` runs every gate in [/gates](/gates/) and prints one verdict line each. `npm run gates -- 02-sustain-town` runs one; add `--seed 99` or `--seconds 600` to override defaults, and `--json` to print the full receipt.
2. The executor (`src/gates/executor.ts`) reads the gate's frontmatter, binds `defaults` plus any overrides to the declared `parameters`, loads content from this bundle and runs the file named by `computation`.
3. It returns a receipt with the fields listed in `executor.receipt`: `gate`, `params`, `ticks`, `scenario_sha256`, `content_hash`, `metrics`.
4. The attester named by `attester.resource` checks the receipt. A failing verdict fails `npm test` and CI.

# Rules for agents

- Supply parameter values only when running a gate. Never edit a scenario file to make a failing gate pass; change the game or the tuning, and say so in the [log](/log.md).
- Gates may be reworked as the game grows, under [decision 0004](/decisions/0004-reworking-gates.md): revise in place with a `# Revisions` entry when the intent is kept, or supersede (deprecate the old gate, keep it) for larger changes or any loosened threshold.
- Deprecated gates are skipped by `npm run gates` and `npm test`, but `npm run gates -- 02` still runs one by name.
