---
type: Map Type
title: Islands
description: Several islands of different sizes across open sea. Villages may start on different islands and need boats to meet.
tags: [map, water]
status: stable
generated: { by: claude/opus-5.5, at: 2026-10-03T12:19:35Z }
order: 1
shape: islands
islands: { count_min: 3, count_max: 6, radius_min: 0.32, radius_max: 0.62, min_tiles: 12 }
neighbours: anywhere
terrain: { large_cell: 9, small_cell: 4, large: 0.5, small: 0.3, base: 0.45, falloff: 0.55 }
shores: { grass: 0.5, sand: 0.45, sea_border: true }
start: { land_radius: 0, clear_radius: 5.5 }
forest: { cell: 6, threshold: 0.56, density: 0.8, scatter: 0.03, grove_density: 0.7 }
---

# Shape

The seed scatters between `count_min` and `count_max` islands, each with a radius between `radius_min` and `radius_max` of half the map's shorter side (never under `min_tiles`, so a village fits even on a small map), kept apart by channels of open sea. Height falls off from each island's centre, so every island has its own shores and noise-cut bays.

# Villages and water

Neighbours may be founded on any island (`neighbours: anywhere`), so two villages can grow up out of reach of each other. Crossing takes boats from a [dock](/blueprints/dock.md); a village that needs to reach across water comes up with the dock ([knowledge](/systems/knowledge.md)).
