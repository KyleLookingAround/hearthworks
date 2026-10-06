---
type: Attested Computation
title: "Gate 21: paths and roads"
description: A town on the standard map lays straight roads through its centre unscripted, nobody is left homeless by them, and deliveries along them are faster than along paths.
tags: [gate, roadmap, roads, logistics]
status: stable
generated: { by: claude/opus-5.5, at: 2026-10-06T16:13:52Z }
runtime: hearthworks-sim
computation: ../references/scenarios/roads.ts
parameters:
  - { name: seed, type: integer, required: true }
  - { name: seconds, type: integer, required: true }
defaults: { seed: 1847, seconds: 3600 }
pass_when: { min_roads_laid: 1, min_roads_straight: 1, min_road_through_centre: 1, max_homeless: 0, max_road_pace_ratio: 0.95, min_fed_min: 0.6, min_built_along_roads: 0.18, min_stone_tiles: 1 }
executor:
  resource: ../references/skills/run-gate.md
  receipt: [gate, params, ticks, scenario_sha256, content_hash, metrics]
attester:
  resource: ../references/attesters/thresholds.ts
---

# Computation

The sanctioned scenario is [roads.ts](/references/scenarios/roads.ts). One settlement plans for itself on the standard map for an hour with planned [roads](/systems/roads.md) on, no build calls. `roads_straight` counts the roads it laid whose every tile is still road along one row or column; `road_through_centre` is 1 when a road passes within two tiles of its first storage yard's door; `homeless` counts everyone who left because their home came down. `stone_tiles` counts the road tiles paved in [stone](/blueprints/stone_road.md) (a stone tile is a road tile for every other count). `road_pace_ratio` is the seconds per straight-line tile of deliveries that went mostly along roads over those that went mostly along paths. `built_along_roads` is the share of buildings planned after the first road with a door onto or looking down to one.

# Proves

Phase 21 of the [roadmap](/roadmap.md), as proposed: a town lays at least one straight road through its centre unscripted, nobody is left homeless by it, and deliveries along roads are faster than along paths (by at least 5%). Added: being fed holds (`fed_min` 0.6, as Gate 2), and the town is planned around its roads: at least 18% of what it builds after its first road has a door onto or looking down to one (`built_along_roads`).

# Supersedes

[Gate 21b](/gates/21b-paths-and-roads.md), which held `built_along_roads` at 0.2. The same scenario and checks; only that threshold is loosened, to 0.18, under [decision 0005](/decisions/0005-relaxing-gates-for-depth.md), when the planner came to keep one wish list on which roads compete with the needs ([planner](/systems/planner.md), 2026-10-06).

0.2 sat at the low edge of what the town does on its own default world. From the same seed with the luck drawn afresh five ways, main's town built 0.316, 0.295, 0.188, 0.289 and 0.264 of its later buildings along roads, so its own third draw already failed; with the wish list (a road a wish at `road_weight` 1) 0.194, 0.198, 0.192, 0.360 and 0.314. On the twelve usual seeds (1 to 7, 42, 99, 1847, 2026, 31337) the share is 0.182 to 0.351, mean 0.242, against 0.19 to 0.322, mean 0.241, on main at e2d64ae; main fails 0.2 on three seeds (1, 5, 7) and the wish list on four (3, 6, 42, 1847). Over three draws of luck a seed, the wish list's mean is 0.255 against main's 0.247, but the default seed's three draws stay at 0.195 together: on that world the farms planned after the first road stand off the roads (1 of 10 against 6 of 12). The town is planned around its roads as much as it was; 0.18 holds every seed and every draw of the default seed, and is still more than the 14 to 22% the phase gave before doors opened onto roads.

# Revisions

- 2026-10-06: superseded Gate 21b, `min_built_along_roads` 0.2 to 0.18.
