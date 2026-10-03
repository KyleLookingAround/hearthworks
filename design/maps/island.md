---
type: Map Type
title: Island
description: One landmass ringed by sea, with a guaranteed grove near the first settlement. The standard map.
tags: [map, standard]
status: stable
generated: { by: claude/opus-5.5, at: 2026-10-03T10:58:17Z }
order: 1
shape: island
terrain: { large_cell: 9, small_cell: 4, large: 0.5, small: 0.3, base: 0.45, falloff: 0.78 }
shores: { grass: 0.5, sand: 0.45, sea_border: true }
start: { land_radius: 0.06, clear_radius: 5.5 }
forest: { cell: 6, threshold: 0.56, density: 0.8, scatter: 0.03, grove_density: 0.7 }
---

# Shape

Height is two octaves of value noise plus `base`, minus `falloff` times the squared distance from the centre, so land gives way to sand and sea towards the edges. The middle (within `land_radius`) is always land, and the map border is always sea.

# Forests and the first settlement

Forest clusters follow a third noise layer above `threshold`, with `scatter` lone trees elsewhere. A grove is planted north-west of the first settlement, and trees are cleared within `clear_radius` of its storage yard.

# Standard

Island at the standard size (see [map](/systems/map.md)) is the world every gate runs on. These numbers reproduce the original island exactly: changing them changes every gate's world.
