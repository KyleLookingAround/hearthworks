---
type: Attested Computation
title: "Gate 4: the village plans its own town"
description: With no build order at all, the village planner grows the town to 20 villagers and keeps it fed over 30 game minutes, matching Gate 2's scripted result.
tags: [gate, roadmap, planner, ai]
status: stable
generated: { by: claude/opus-5.5, at: 2026-10-03T10:30:27Z }
runtime: hearthworks-sim
computation: ../references/scenarios/village-plans.ts
parameters:
  - { name: seed, type: integer, required: true }
  - { name: seconds, type: integer, required: true }
defaults: { seed: 1847, seconds: 1800 }
pass_when: { min_peak_villagers: 20, min_villagers: 18, max_departures: 2, min_mood_min: 0.6 }
executor:
  resource: ../references/skills/run-gate.md
  receipt: [gate, params, ticks, scenario_sha256, content_hash, metrics]
attester:
  resource: ../references/attesters/thresholds.ts
---

# Computation

The sanctioned scenario is [village-plans.ts](/references/scenarios/village-plans.ts). It creates the starting settlement with the [village planner](/systems/planner.md) switched on and runs it. It makes no build calls: every building after the starting storage yard and two houses is chosen, sited and queued by the planner. `mood_min` is tracked after a five-minute warm-up.

# Proves

Phase 4 of the [roadmap](/roadmap.md): the planner can stand in for [Gate 2's scripted build order](/gates/02-sustain-town.md). The thresholds are Gate 2's, so the planner has to match the script on growth, departures and mood, not merely survive.

# Since Phase 5

The Courier Depot is no longer known at the founding, so in this gate the village has to come up with it under hauling strain before it builds one. The scenario is unchanged.

# Metrics

Besides the standard metrics the receipt records `planned` (sites the planner placed) and the count of each finished building type, so a regression shows what the village stopped building.
