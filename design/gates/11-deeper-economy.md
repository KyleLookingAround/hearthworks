---
type: Attested Computation
title: "Gate 11: a deeper economy"
description: One self-planning settlement builds chains several steps deep in an hour, and its homes climb the tiers by goods while staying stocked with food.
tags: [gate, roadmap, economy, needs]
status: stable
generated: { by: claude/opus-5.5, at: 2026-10-03T16:37:59Z }
runtime: hearthworks-sim
computation: ../references/scenarios/deeper-economy.ts
parameters:
  - { name: seed, type: integer, required: true }
  - { name: seconds, type: integer, required: true }
  - { name: map, type: string, required: true }
  - { name: size, type: string, required: true }
defaults: { seed: 1847, seconds: 3600, map: island, size: standard }
pass_when: { min_tier3_share: 0.2, min_homes_stocked: 0.9, min_goods_made: 10, min_fed_min: 0.6, max_departures: 2 }
executor:
  resource: ../references/skills/run-gate.md
  receipt: [gate, params, ticks, scenario_sha256, content_hash, metrics]
attester:
  resource: ../references/attesters/thresholds.ts
---

# Computation

The sanctioned scenario is [deeper-economy.ts](/references/scenarios/deeper-economy.ts). One settlement plans for itself on the standard map for an hour with no build calls. Every ten seconds after a five-minute warm-up it checks each lived-in home: `homes_stocked` is the share of those checks that found the home's food on the shelf. At the end, `tier3_share` is the share of lived-in homes at the third tier (bread, fish or cloth, and tools; [needs](/systems/needs.md)), and `goods_made` how many different goods the settlement's buildings make.

# Proves

Phase 11 of the [roadmap](/roadmap.md): a deeper economy.

- `goods_made` at least 10: chains several steps deep, unscripted: quarries, mines and smithies, clay pits and brickworks, fisheries, flax farms and weavers, alongside wood and bread.
- `tier3_share` at least 20%: homes climb the tiers by goods.
- `homes_stocked` at least 90%, `fed_min` and departures at Gate 2's level: comforts never cost the bread.
