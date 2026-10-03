---
type: Map Type
title: Lone isle
description: A single island ringed by sea. The standard map every gate runs on.
tags: [map, standard]
status: stable
generated: { by: claude/opus-5.5, at: 2026-10-03T12:19:35Z }
order: 4
shape: island
terrain: { large_cell: 9, small_cell: 4, large: 0.5, small: 0.3, base: 0.45, falloff: 0.78 }
shores: { grass: 0.5, sand: 0.45, sea_border: true }
start: { land_radius: 0.06, clear_radius: 5.5 }
forest: { cell: 6, threshold: 0.56, density: 0.8, scatter: 0.03, grove_density: 0.7 }
---

# Shape

Height is two octaves of value noise plus `base`, minus `falloff` times the squared distance from the centre, so land gives way to sand and sea towards the edges. The middle (within `land_radius`) is always land, and the map border is always sea.

# Forests and settlements

Forest clusters follow a third noise layer above `threshold`, with `scatter` lone trees elsewhere. Where settlements start is chosen by the seed ([settlement](/systems/settlement.md)); each gets a grove (`grove_density`) planted north-west of it, and trees cleared within `clear_radius` of its storage yard.

# Standard

Island at the standard size (see [map](/systems/map.md)) is the world every gate runs on. The land is the original island's for every seed; since settlements are placed by the seed, the villages on it are not where they used to be. Changing these numbers changes every gate's world.
