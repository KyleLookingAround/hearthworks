---
type: Attested Computation
title: "Gate 5: a practice spreads between two settlements"
description: Two self-planning settlements start without the Courier Depot; one invents it under strain, a visitor carries it to the other, and the other proves it in use, within 40 game minutes.
tags: [gate, roadmap, knowledge, settlement]
status: stable
generated: { by: claude/opus-5.5, at: 2026-10-03T10:22:42Z }
runtime: hearthworks-sim
computation: ../references/scenarios/knowledge-spreads.ts
parameters:
  - { name: seed, type: integer, required: true }
  - { name: seconds, type: integer, required: true }
defaults: { seed: 1847, seconds: 2400 }
pass_when: { min_settlements: 2, min_invented: 1, min_practice_spread: 1, min_peak_villagers: 20, max_departures: 2, min_mood_min: 0.6 }
executor:
  resource: ../references/skills/run-gate.md
  receipt: [gate, params, ticks, scenario_sha256, content_hash, metrics]
attester:
  resource: ../references/attesters/thresholds.ts
---

# Computation

The sanctioned scenario is [knowledge-spreads.ts](/references/scenarios/knowledge-spreads.ts). It creates the island with two settlements, Hearth at the centre and a neighbour founded as far off as the land allows, each with its own [planner](/systems/planner.md) on. Neither knows the [Courier Depot](/blueprints/depot.md): its `discovery` block makes it something a village has to come up with. The scenario makes no build calls. `mood_min` is tracked after a five-minute warm-up.

# Proves

Phase 5 of the [roadmap](/roadmap.md): [knowledge](/systems/knowledge.md) is a thing in the world.

- `invented`: a village came up with something under strain.
- `practice_spread`: a village learned it from a visitor (`from` is set, not invented there) **and** has since verified it in use itself. Hearing of an idea is not enough; the practice has to take hold.
- The growth and welfare thresholds are Gate 2's and Gate 4's, so knowledge must not cost the villages their bread.
