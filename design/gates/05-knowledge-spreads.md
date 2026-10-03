---
type: Attested Computation
title: "Gate 5: a practice spreads between two settlements"
description: Two self-planning settlements start without the Courier Depot; one invents it under strain, a visitor carries it to the other, and the other proves it in use, within 40 game minutes.
tags: [gate, roadmap, knowledge, settlement]
status: stable
generated: { by: claude/opus-5.5, at: 2026-10-03T15:06:44Z }
runtime: hearthworks-sim
computation: ../references/scenarios/knowledge-spreads.ts
parameters:
  - { name: seed, type: integer, required: true }
  - { name: seconds, type: integer, required: true }
  - { name: map, type: string, required: true }
  - { name: size, type: string, required: true }
defaults: { seed: 1847, seconds: 2400, map: island, size: standard }
pass_when: { min_settlements: 2, min_invented: 1, min_practice_spread: 1, min_peak_villagers: 150, max_departures: 2, min_fed_min: 0.6 }
executor:
  resource: ../references/skills/run-gate.md
  receipt: [gate, params, ticks, scenario_sha256, content_hash, metrics]
attester:
  resource: ../references/attesters/thresholds.ts
---

# Computation

The sanctioned scenario is [knowledge-spreads.ts](/references/scenarios/knowledge-spreads.ts). It creates the standard map with two settlements, each placed by the seed ([settlement](/systems/settlement.md)), each with its own [planner](/systems/planner.md) on. Neither knows the [Courier Depot](/blueprints/depot.md): its `discovery` block makes it something a village has to come up with. The scenario makes no build calls. `mood_min` is tracked after a five-minute warm-up.

# Proves

Phase 5 of the [roadmap](/roadmap.md): [knowledge](/systems/knowledge.md) is a thing in the world.

- `invented`: a village came up with something under strain.
- `practice_spread`: a village learned it from a visitor (`from` is set, not invented there) **and** has since verified it in use itself. Hearing of an idea is not enough; the practice has to take hold.
- The growth and welfare thresholds are Gate 2's and Gate 4's, so knowledge must not cost the villages their bread.

# Revisions

- 2026-10-03: moved to the standard map, Island at the standard size (112 by 80), named by the new `map` and `size` parameters (roadmap Phase 7). `min_peak_villagers` rises from 20 to 150 (168 to 232 on the six swept seeds). Tightened, not loosened.
- 2026-10-03: its world's size is renamed (`isle` for the 56 by 40 Lone isle, `standard` for 112 by 80), since player sizes are now S to XL. Same world, same receipts.
- 2026-10-03: welfare is held with `fed_min` instead of `mood_min`: mood now blends in the homes' surroundings, and this gate is about nobody going hungry (roadmap Phase 8). Same bar, 0.6.
