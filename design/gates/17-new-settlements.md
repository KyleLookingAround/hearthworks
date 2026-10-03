---
type: Attested Computation
title: "Gate 17: new settlements"
description: On the largest landmass one settlement becomes at least four, unscripted, each fed and growing.
tags: [gate, roadmap, settlement]
status: stable
generated: { by: claude/opus-5.5, at: 2026-10-03T19:56:28Z }
runtime: hearthworks-sim
computation: ../references/scenarios/settling.ts
parameters:
  - { name: seed, type: integer, required: true }
  - { name: seconds, type: integer, required: true }
  - { name: map, type: string, required: true }
  - { name: size, type: string, required: true }
defaults: { seed: 1847, seconds: 5400, map: landmass, size: l }
pass_when: { min_settlements: 4, min_growth_min: 1.5, min_fed_min: 0.6 }
executor:
  resource: ../references/skills/run-gate.md
  receipt: [gate, params, ticks, scenario_sha256, content_hash, metrics]
attester:
  resource: ../references/attesters/thresholds.ts
---

# Computation

The sanctioned scenario is [settling.ts](/references/scenarios/settling.ts). One settlement plans for itself on Landmass at size L for 90 game minutes with [settling](/systems/settling.md) on, no build calls. Each settlement is watched from its founding: `fed_min` is the lowest share fed in any of them from five minutes after its founding, and `growth_min` the fewest times its first people any settlement at least fifteen minutes old has at the end.

# Proves

Phase 17 of the [roadmap](/roadmap.md), as proposed: at least four settlements, unscripted, each fed (`fed_min` at Gate 2's 0.6) and growing (`growth_min` at least 1.5).
