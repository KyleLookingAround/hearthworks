---
type: Attested Computation
title: "Gate 1: a plank with no player clicks"
description: After placing a Forester and a Sawmill, villagers alone build both, fell trees and saw planks within three minutes.
tags: [gate, roadmap, wood]
status: stable
generated: { by: claude/opus-5.5, at: 2026-10-03T13:40:50Z }
runtime: hearthworks-sim
computation: ../references/scenarios/first-plank.ts
parameters:
  - { name: seed, type: integer, required: true }
  - { name: seconds, type: integer, required: true }
  - { name: map, type: string, required: true }
  - { name: size, type: string, required: true }
defaults: { seed: 1847, seconds: 180, map: island, size: medium }
pass_when: { min_planks_made: 3, max_sites_unfinished: 0 }
executor:
  resource: ../references/skills/run-gate.md
  receipt: [gate, params, ticks, scenario_sha256, content_hash, metrics]
attester:
  resource: ../references/attesters/thresholds.ts
---

# Computation

The sanctioned scenario is [first-plank.ts](/references/scenarios/first-plank.ts). It places a [Forester](/blueprints/forester.md) and a [Sawmill](/blueprints/sawmill.md) as sites and runs the sim headless; nothing else is scripted.

# Proves

Phase 1 of the [roadmap](/roadmap.md): the [job board](/systems/logistics.md) delivers construction planks, workers staff both buildings, and the wood chain runs end to end.

# Revisions

- 2026-10-03: moved to the standard map, Island at medium size, named by the new `map` and `size` parameters (roadmap Phase 7).
