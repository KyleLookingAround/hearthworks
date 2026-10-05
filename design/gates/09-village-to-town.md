---
type: Attested Computation
title: "Gate 9: village to town"
description: One self-planning settlement grows from a roomy hamlet into a town in an hour, with denser homes, replanned blocks, workplaces pulled down or moved out of its centres, three districts, nobody leaving for it and everyone fed.
tags: [gate, roadmap, planner, housing]
status: stable
generated: { by: claude/opus-5.5, at: 2026-10-05T22:30:00Z }
runtime: hearthworks-sim
computation: ../references/scenarios/village-to-town.ts
parameters:
  - { name: seed, type: integer, required: true }
  - { name: seconds, type: integer, required: true }
  - { name: map, type: string, required: true }
  - { name: size, type: string, required: true }
defaults: { seed: 1847, seconds: 3600, map: island, size: standard }
pass_when: { min_town_form: 2, min_blocks_replanned: 1, min_density_ratio: 1.5, min_districts: 3, max_demolition_departures: 0, min_fed_min: 0.6, max_departures: 2, max_planner_spots_per_min: 65000, min_renewed: 1 }
executor:
  resource: ../references/skills/run-gate.md
  receipt: [gate, params, ticks, scenario_sha256, content_hash, metrics]
attester:
  resource: ../references/attesters/thresholds.ts
---

# Computation

The sanctioned scenario is [village-to-town.ts](/references/scenarios/village-to-town.ts). It founds one settlement on the standard map with its [planner](/systems/planner.md) on and makes no build calls for an hour. `density_ratio` is beds per tile of housing land (home footprints and the ring of land around them) at the end, over the same for the founding hamlet's two cottages. `town_form` is 0 for a hamlet, 1 for a village, 2 for a town. `fed_min` is tracked after a five-minute warm-up. `renewed` counts the workplaces the planner pulled down because they no longer paid (`pulled_down`) and those it moved out of a district centre (`moved_out`); `centre_home_share` (the share of finished buildings within `centre_radius` of a district's storage yard that are homes) and the mean delivery time and straight-line tiles are reported, not judged.

# Proves

Phase 9 of the [roadmap](/roadmap.md): a village becomes a town.

- `town_form = 2` and `density_ratio` at least 1.5: it climbs the ladder of homes from [Cottages](/blueprints/house.md) to [Family Houses](/blueprints/family_house.md) and [Terraces](/blueprints/terrace.md), set wall to wall along streets.
- `blocks_replanned` at least 1 with `demolition_departures = 0`: old homes come down for denser ones, and everyone living there moves first.
- `renewed` at least 1: the town looks over what it has built, unscripted, and pulls down what no longer pays or moves land and noise out of its centres to make room for homes ([renewal](/systems/planner.md)).
- `districts` at least 3: crowded districts split, so the planner searches one district at a time.
- `planner_spots_per_min` within [Gate 7](/gates/07-worlds.md)'s budget, and `fed_min`: none of it costs the town its bread.

# Revisions

- 2026-10-05: revised in place for the second pass over Phase 9 (renewal): adds `min_renewed: 1`, and reports `pulled_down`, `moved_out`, `centre_home_share`, `mean_delivery_seconds` and `mean_delivery_tiles`. Nothing loosened; same scenario and intent. On the usual twelve seeds main renews nothing (and misses `blocks_replanned` on seed 5); with renewal every seed renews 2 to 7 buildings and replans 4 to 9 blocks against 0 to 5 (villages replan too), passing every check: `fed_min` 0.67 to 0.98 (main 0.79 to 0.98), 1 departure in all (seed 31337) against none, 2189 villagers against 2203.
