---
type: Decision
title: "0001: Keep design knowledge as an OKF bundle"
description: Design docs, balance numbers and blueprints live in design/ as OKF v0.2 concepts that the game loads as content.
tags: [decision, okf, process]
status: stable
generated: { by: claude/opus-5.5, at: 2026-10-03T08:15:00Z }
sources:
  - id: okf-spec
    resource: https://github.com/GoogleCloudPlatform/open-knowledge-format
    title: Open Knowledge Format v0.2
---

# Decision

The design lives in `design/` as an Open Knowledge Format bundle: markdown with YAML frontmatter, `index.md` per folder and a `log.md`.[^okf-spec] Blueprints, goods and tuning numbers are read by the game from the same files.

# Why

- **One source of truth.** A balance number in a doc is the number in the game; they cannot drift.
- **Agent-friendly.** Claude Code reads `index.md` first and opens only what it needs. `generated` records which agent wrote a concept.
- **Trust is visible.** Kyle's playtest sign-off is `verified: { by: human:kyle }`. Anything without it is unverified.
- **Gates are attested.** Roadmap gates are Attested Computations: a sanctioned scenario, a receipt, and a deterministic attester. A doc cannot claim balance the sim does not deliver.
- **Same shape in the game.** The [planner](/systems/planner.md) can treat a village's knowledge as a bundle too.

# Consequences

- Frontmatter uses a strict YAML subset read by `src/content/yaml.ts` (no runtime dependencies). Unsupported syntax fails CI with a line number.
- `log.md` is reserved at every level, so goods use plural ids (`logs`, `planks`).
- Game-specific keys (`cost`, `recipe`, `tuning`, `pass_when`) are OKF extensions; other OKF tools ignore them.

[^okf-spec]: Open Knowledge Format v0.2
