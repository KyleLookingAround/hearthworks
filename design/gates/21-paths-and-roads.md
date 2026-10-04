---
type: Attested Computation
title: "Gate 21: paths and roads"
description: A town on the standard map lays straight roads through its centre unscripted, nobody is left homeless by them, and deliveries along them are faster than along paths.
tags: [gate, roadmap, roads, logistics]
status: stable
generated: { by: claude/opus-5.5, at: 2026-10-04T05:39:27Z }
runtime: hearthworks-sim
computation: ../references/scenarios/roads.ts
parameters:
  - { name: seed, type: integer, required: true }
  - { name: seconds, type: integer, required: true }
defaults: { seed: 1847, seconds: 3600 }
pass_when: { min_roads_laid: 1, min_roads_straight: 1, min_road_through_centre: 1, max_homeless: 0, max_road_pace_ratio: 0.95, min_fed_min: 0.6, min_built_along_roads: 0.25 }
executor:
  resource: ../references/skills/run-gate.md
  receipt: [gate, params, ticks, scenario_sha256, content_hash, metrics]
attester:
  resource: ../references/attesters/thresholds.ts
---

# Computation

The sanctioned scenario is [roads.ts](/references/scenarios/roads.ts). One settlement plans for itself on the standard map for an hour with planned [roads](/systems/roads.md) on, no build calls. `roads_straight` counts the roads it laid whose every tile is still road along one row or column; `road_through_centre` is 1 when a road passes within two tiles of its first storage yard's door; `homeless` counts everyone who left because their home came down. `road_pace_ratio` is the seconds per straight-line tile of deliveries that went mostly along roads over those that went mostly along paths. `built_along_roads` is the share of buildings planned after the first road with a door onto or looking down to one.

# Proves

Phase 21 of the [roadmap](/roadmap.md), as proposed: a town lays at least one straight road through its centre unscripted, nobody is left homeless by it, and deliveries along roads are faster than along paths (by at least 5%). Added: being fed holds (`fed_min` 0.6, as Gate 2), and the town is planned around its roads: at least a quarter of what it builds after its first road has a door onto or looking down to one (`built_along_roads`).

# Revisions

- 2026-10-04: tightened in place (the second pass): `built_along_roads`, reported since the phase was built (14 to 22% on six seeds), is now held at 0.25. A building's ring of open land may now be a planned road, so a door can open straight onto one, and a new district's heart goes beside a road where it can; on seeds 1847, 7, 42, 99, 2026 and 31337 it is 22 to 32% (1847: 0.32). Same scenario and intent.
