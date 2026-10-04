---
type: Attested Computation
title: "Gate 22: farms that grow"
description: A self-planning town on the standard map with seasons grows a farm to its largest size unscripted, worked by more than one hand and making more per tile than its first farm, and its homes eat a varied diet.
tags: [gate, roadmap, farms, food]
status: stable
generated: { by: claude/opus-5.5, at: 2026-10-04T10:16:19Z }
runtime: hearthworks-sim
computation: ../references/scenarios/farms.ts
parameters:
  - { name: seed, type: integer, required: true }
  - { name: seconds, type: integer, required: true }
  - { name: map, type: string, required: true }
  - { name: size, type: string, required: true }
defaults: { seed: 1847, seconds: 3600, map: island, size: standard }
pass_when: { min_farms_at_largest: 1, min_max_hands: 2, min_yield_per_tile_ratio: 1.2, min_foods_eaten: 3, min_varied_homes_share: 1, min_fed_min: 0.6 }
executor:
  resource: ../references/skills/run-gate.md
  receipt: [gate, params, ticks, scenario_sha256, content_hash, metrics]
attester:
  resource: ../references/attesters/thresholds.ts
---

# Computation

The sanctioned scenario is [farms.ts](/references/scenarios/farms.ts). One settlement plans for itself on the standard map with [seasons](/systems/seasons.md) and [farms that grow](/systems/farms.md) on, for three years, with no build calls. Every game second it notes, for each workplace that grows, how many hands are at work there and, while it works outside winter, what it made against its fields (tile-seconds), by size. `yield_per_tile_ratio` is what the first farm to reach its largest size made per tile-second of work at that size, over what the settlement's first farm made per tile-second of work while a smallholding. `foods_eaten` counts the foods homes ate; `varied_homes_share` is the share of homes lived in for a year or more whose people ate two foods or more in the last year. `fed_min` is tracked after a five-minute warm-up.

# Proves

Phase 22 of the [roadmap](/roadmap.md), as proposed: a town grows at least one farm to its largest size unscripted (`farms_at_largest`), staffed by more than one hand at once (`max_hands`), making more per tile of land than its first farm did (by at least a fifth); at least three foods are grown and eaten; every home lived in for a year has eaten two foods or more in the last year; being fed holds (`fed_min` 0.6).
