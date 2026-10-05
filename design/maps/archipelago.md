---
type: Map Type
title: Archipelago
description: Many small islands strewn across the sea. No village has room for long on its own island; it grows by its boats and colonies.
tags: [map, water]
status: stable
generated: { by: claude/opus-5.5, at: 2026-10-05T02:15:02Z }
order: 4
shape: islands
islands: { count_min: 6, count_max: 9, radius_min: 0.22, radius_max: 0.42, min_tiles: 10, scale_tiles: 24, count_cap: 8 }
neighbours: anywhere
sizes: [s, m, l, xl]
terrain: { large_cell: 9, small_cell: 4, large: 0.5, small: 0.3, base: 0.45, falloff: 0.55 }
shores: { grass: 0.5, sand: 0.45, sea_border: true }
start: { land_radius: 0, clear_radius: 5.5 }
forest: { cell: 6, threshold: 0.56, density: 0.8, scatter: 0.03, grove_density: 0.7 }
sea: { reefs: 0.3 }
---

# Shape

Like [Islands](/maps/islands.md), but with more and smaller islands (radius at most `scale_tiles` 24 tiles), so a settlement soon runs out of room at home. Villages come up with the [dock](/blueprints/dock.md) once their own island is full ([settling](/systems/settling.md)), and found colonies across the water.

# The sea

Shallows along every shore and reefs out at sea (`sea`, about `reefs` of the water where reefs may lie), and with charts on, islands a settlement has not seen are unknown to it until a boat or an explorer charts them: see [the sea](/systems/sea.md).

# Not yet

Open sea that only ships can cross, shipyards and crewed ships come with later work on the sea.
