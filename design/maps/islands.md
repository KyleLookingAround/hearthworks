---
type: Map Type
title: Islands
description: Several islands of different sizes across open sea. Villages may start on different islands and need boats to meet.
tags: [map, water]
status: stable
generated: { by: claude/opus-5.5, at: 2026-10-05T02:15:02Z }
order: 1
shape: islands
islands: { count_min: 3, count_max: 6, radius_min: 0.32, radius_max: 0.62, min_tiles: 12, scale_tiles: 40, count_cap: 8 }
neighbours: anywhere
sizes: [standard, s, m, l, xl]
terrain: { large_cell: 9, small_cell: 4, large: 0.5, small: 0.3, base: 0.45, falloff: 0.55 }
shores: { grass: 0.5, sand: 0.45, sea_border: true }
start: { land_radius: 0, clear_radius: 5.5 }
forest: { cell: 6, threshold: 0.56, density: 0.8, scatter: 0.03, grove_density: 0.7 }
sea: { reefs: 0.3 }
---

# Shape

The seed scatters between `count_min` and `count_max` islands, each with a radius between `radius_min` and `radius_max` of half the map's shorter side, or of `scale_tiles` if that is smaller. Bigger maps keep islands that size and get more of them, in proportion to the area (at most `count_cap` times as many): about 8 on S and 50 on L and XL (never under `min_tiles`, so a village fits even on a small map), kept apart by channels of open sea. Height falls off from each island's centre, so every island has its own shores and noise-cut bays.

# Sizes

Islands are offered at every size a player can pick, and at the standard size for tests, but not on the tiny Isle the scripted gates use: its islands hold 200 to 500 tiles of grass in all, too little for two villages.

# Villages and water

Neighbours may be founded on any island (`neighbours: anywhere`), so two villages can grow up out of reach of each other. Crossing takes boats from a [dock](/blueprints/dock.md); a village that needs to reach across water comes up with the dock ([knowledge](/systems/knowledge.md)).

# The sea

Shallows run along every shore, and reefs lie out at sea over about `reefs` of the water where they may (the `sea` block): boats row slowly through shallows and round reefs. With charts on, a village knows only the islands it has seen or been told of, and sends explorers for the rest ([the sea](/systems/sea.md)).
