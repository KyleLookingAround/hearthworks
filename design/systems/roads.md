---
type: System
title: Roads
description: Paths are worn where people walk; roads are planned as long straight strips that cut through what stands, and the town is then built along them.
tags: [roads, logistics, planner]
status: draft
generated: { by: claude/opus-5.5, at: 2026-10-05T21:56:14Z }
tuning:
  traffic_from: 8
  traffic_span: 8
  villagers_per_road: 40
  look_every_seconds: 120
  min_traffic: 20
  margin: 3
  min_length: 12
  demolish_weight: 300
  home_weight: 500
  spacing: 12
  front_weight: 6
  near_weight: 2
  near_tiles: 3
  district_weight: 10
  district_reach: 3
---

# Idea

Kyle's idea. Before Phase 21 every "road" was a desire path: worn where people walk and paved by the planner, winding around whatever stands. Those are now [paths](/blueprints/path.md). Real towns lay their roads first and build along them: planned roads are on in every new game and off in scenarios that predate them (`plannedRoads`). Code: `src/sim/roads.ts`.

# Thinking of roads

A village or town strains under `traffic` while its deliveries run long: none at an average of `traffic_from` straight-line tiles (walk to the goods plus the haul), full at `traffic_span` more. Under that strain it comes up with the [Road](/blueprints/road.md) ([knowledge](/systems/knowledge.md)).

# Laying a road

Every `look_every_seconds` a self-planning village or town that knows the road, with fewer roads than one and another for every `villagers_per_road` people (main roads only), looks at every row and column of tiles across its extent (its buildings, `margin` tiles around) and scores each straight run that could be a road:

- **Traffic.** The footsteps worn on its tiles: a road goes where people already walk. A run worn less than `min_traffic` footsteps a tile on average, or shorter than `min_length`, is not worth laying.
- **What stands in its line.** A road cuts through what stands, as long as the strip stays straight: each workplace or site it would clear costs `demolish_weight`, each home `home_weight`. Storage yards, bridges, docks and the like, and universities, it cannot cross; the run stops at them, and at water and rock. With [seasons](/systems/seasons.md), from autumn to the end of winter or while the winter store is behind, it cannot cross the workplaces of the food chain either: a settlement cannot spare its bread then.
- **Through the centre.** The first road must pass by the first storage yard's door (within two tiles); later ones must be at least `spacing` tiles from a road of the same settlement running the same way.

The best run that scores above nothing is laid if the settlement can pay `cost` a tile from its stores. Everyone living in a home in its line moves first, to free beds elsewhere (a run that would leave anyone homeless is passed over); then the buildings come down, salvaging `salvage_share` of their cost as replanning does ([planner](/systems/planner.md)), and the strip is paved. The chronicle records it. Desire paths keep being worn and paved around roads.

# Planned around

Once roads are laid, the planner sites buildings along them: a spot whose door opens onto a road (its front tile on the road or beside it) gains `front_weight`, and one whose door looks down a straight run of at most `near_tiles` to a road gains `near_weight`. The ring of open land every building keeps ([planner](/systems/planner.md)) may be road, so a door can open straight onto one (never a path, and nothing stands on a road). A new district's heart goes beside a road where one passes within `district_reach` tiles of a candidate (worth `district_weight` tiles of its spacing), so districts grow along their roads. What a road cleared away comes back along it, as the planner sees the shortage again.

# Roads of stone

A settlement that knows the [Stone Road](/blueprints/stone_road.md) (thought of under `traffic` once the Road is known) repaves its roads in stone. At a look when it has no new road to lay, it takes the busiest of its roads with tiles not yet of stone, by the footsteps worn on them, and paves the whole strip, at the stone road's `cost` a tile, if its stores hold enough stone to spare ([production](/systems/production.md): the planner wants no more of it and its stores hold `surplus_min` or more) and all the strip needs. Stone roads are walked at `stone_road_speed` ([logistics](/systems/logistics.md)) and drawn as cobbles. Nothing is made for them: a settlement with no quarry, or no stone to spare, keeps its roads as they are.

# Kyle's call

Whether roads should run on to the neighbours, and whether roads of stone should cost cut stone (from a mason) rather than stone.
