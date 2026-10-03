---
type: Decision
title: "0002: Deterministic, DOM-free simulation core"
description: All game rules live in src/sim as pure TypeScript with a seeded RNG, so the same seed and commands always give the same town.
tags: [decision, architecture]
status: stable
generated: { by: claude/opus-5.5, at: 2026-10-03T08:15:00Z }
---

# Decision

`src/sim` holds every rule and knows nothing about the browser. It advances in fixed 0.1 s steps and draws all randomness from a seeded generator stored in the state. The renderer and UI only read state and issue commands.

# Why

- [Gates](/gates/) run the real game headless in Node in under a second each.
- Bugs reproduce from a seed.
- A future [planner](/systems/planner.md) can simulate options ahead without touching the screen.
- The sim can move into a Web Worker if the town gets large.

# Consequences

`Math.random` is banned in `src/sim`. The UI may use it (for example to pick a new island seed).
