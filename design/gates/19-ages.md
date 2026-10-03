---
type: Attested Computation
title: "Gate 19: ages"
description: An age turns across at least half the settlements unscripted, and an isolated settlement without a library falls back an age when it stops practising its crafts.
tags: [gate, roadmap, ages, knowledge]
status: stable
generated: { by: claude/opus-5.5, at: 2026-10-03T20:47:33Z }
runtime: hearthworks-sim
computation: ../references/scenarios/ages.ts
parameters:
  - { name: seed, type: integer, required: true }
  - { name: seconds, type: integer, required: true }
  - { name: keep_seconds, type: integer, required: true }
  - { name: map, type: string, required: true }
  - { name: size, type: string, required: true }
defaults: { seed: 1847, seconds: 5400, keep_seconds: 900, map: landmass, size: l }
pass_when: { min_age_share: 0.5, min_settlements: 2, min_fell_back_without_library: 1, max_fell_back_with_library: 0 }
executor:
  resource: ../references/skills/run-gate.md
  receipt: [gate, params, ticks, scenario_sha256, content_hash, metrics]
attester:
  resource: ../references/attesters/thresholds.ts
---

# Computation

The sanctioned scenario is [ages.ts](/references/scenarios/ages.ts), in two parts.

- **Spread.** One settlement plans for itself on Landmass at size L for 90 game minutes with settling, carts, trade and people on, no build calls. `age_share` is the share of the settlements at the end that are past the first age ([ages](/systems/ages.md)).
- **Regression.** One isolated settlement is taught the discoveries of the second age by a neighbour (scripted) and never builds them; it runs for `keep_seconds` without a library and again with one standing.

# Proves

Phase 19 of the [roadmap](/roadmap.md), as proposed: an age turns across at least half the settlements unscripted; an isolated settlement without a library loses crafts it stopped practising and falls back an age, and with a library it does not.
