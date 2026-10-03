---
type: Attested Computation
title: "Gate 2: the town grows and stays fed"
description: With a scripted build order, the town reaches 20 villagers and nobody leaves hungry over 30 game minutes.
tags: [gate, roadmap, needs, balance]
status: stable
generated: { by: claude/opus-5.5, at: 2026-10-03T08:15:00Z }
runtime: hearthworks-sim
computation: ../references/scenarios/sustain-town.ts
parameters:
  - { name: seed, type: integer, required: true }
  - { name: seconds, type: integer, required: true }
  - { name: max_houses, type: integer, required: false }
defaults: { seed: 1847, seconds: 1800, max_houses: 8 }
pass_when: { min_peak_villagers: 20, min_villagers: 18, max_departures: 2, min_mood_min: 0.6 }
executor:
  resource: ../references/skills/run-gate.md
  receipt: [gate, params, ticks, scenario_sha256, content_hash, metrics]
attester:
  resource: ../references/attesters/thresholds.ts
---

# Computation

The sanctioned scenario is [sustain-town.ts](/references/scenarios/sustain-town.ts): a rule-based stand-in for the [planner](/systems/planner.md). It starts the wood and bread chains, then once a minute adds a house when beds run out, a farm and bakery per eight villagers, and a second forester and sawmill past ten villagers. `mood_min` is tracked after a five-minute warm-up.

# Proves

Phase 2 of the [roadmap](/roadmap.md): the [needs](/systems/needs.md) and production numbers support a growing town. If a tuning change in [needs](/systems/needs.md) or a [blueprint](/blueprints/) breaks this, CI fails before the change merges.
