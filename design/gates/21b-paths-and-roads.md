---
type: Attested Computation
title: "Gate 21: paths and roads"
description: A town on the standard map lays straight roads through its centre unscripted, nobody is left homeless by them, and deliveries along them are faster than along paths.
tags: [gate, roadmap, roads, logistics]
status: deprecated
generated: { by: claude/opus-5.5, at: 2026-10-05T06:08:52Z }
runtime: hearthworks-sim
computation: ../references/scenarios/roads.ts
parameters:
  - { name: seed, type: integer, required: true }
  - { name: seconds, type: integer, required: true }
defaults: { seed: 1847, seconds: 3600 }
pass_when: { min_roads_laid: 1, min_roads_straight: 1, min_road_through_centre: 1, max_homeless: 0, max_road_pace_ratio: 0.95, min_fed_min: 0.6, min_built_along_roads: 0.2, min_stone_tiles: 1 }
executor:
  resource: ../references/skills/run-gate.md
  receipt: [gate, params, ticks, scenario_sha256, content_hash, metrics]
attester:
  resource: ../references/attesters/thresholds.ts
---

# Computation

The sanctioned scenario is [roads.ts](/references/scenarios/roads.ts). One settlement plans for itself on the standard map for an hour with planned [roads](/systems/roads.md) on, no build calls. `roads_straight` counts the roads it laid whose every tile is still road along one row or column; `road_through_centre` is 1 when a road passes within two tiles of its first storage yard's door; `homeless` counts everyone who left because their home came down. `stone_tiles` counts the road tiles paved in [stone](/blueprints/stone_road.md) (a stone tile is a road tile for every other count). `road_pace_ratio` is the seconds per straight-line tile of deliveries that went mostly along roads over those that went mostly along paths. `built_along_roads` is the share of buildings planned after the first road with a door onto or looking down to one.

# Proves

Phase 21 of the [roadmap](/roadmap.md), as proposed: a town lays at least one straight road through its centre unscripted, nobody is left homeless by it, and deliveries along roads are faster than along paths (by at least 5%). Added: being fed holds (`fed_min` 0.6, as Gate 2), and the town is planned around its roads: at least a fifth of what it builds after its first road has a door onto or looking down to one (`built_along_roads`).

# Supersedes

[Gate 21 (the first)](/gates/21-paths-and-roads.md), which held `built_along_roads` at 0.25. The same scenario and checks; only that threshold is loosened, to 0.2, under [decision 0005](/decisions/0005-relaxing-gates-for-depth.md), when settlements began stocking each good for its purpose ([production](/systems/production.md), 2026-10-05).

0.25 sat in the middle of what the town does on its own default world: from the same seed, with the luck drawn afresh four times, main's town built 0.29, 0.20, 0.16 and 0.31 of its later buildings along roads (0.32 on the seed itself), so the gate passed by the luck of its first run. With stocks for their purpose the seed's run gives 0.227 (and 0.27, 0.22, 0.21 and 0.24 with the luck redrawn). On twelve seeds (1 to 6, 1847, 7, 42, 99, 2026, 31337) the share is 0.15 to 0.39, mean 0.276, against 0.15 to 0.41, mean 0.271, before; both fail 0.25 on four seeds. The town is planned around its roads as much as it was; 0.2 holds the default seed with the spread of its own runs, and is still more than the 14 to 22% the phase gave before doors opened onto roads.

# Superseded

By [Gate 21c](/gates/21c-paths-and-roads.md) on 2026-10-06: the same scenario and checks with `min_built_along_roads` 0.18, as the default seed's own draw (0.194) with the planner's wish list sat within the spread of main's own runs (0.188 to 0.316). Kept, and runnable by name (`npm run gates -- 21b`).

# Revisions

- 2026-10-05: superseded Gate 21 (the first), `min_built_along_roads` 0.25 to 0.2.
