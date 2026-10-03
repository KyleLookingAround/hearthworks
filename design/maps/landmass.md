---
type: Map Type
title: Landmass
description: Land to the edges of the map, broken by lakes and wide forests. No sea hems towns in.
tags: [map]
status: stable
generated: { by: claude/opus-5.5, at: 2026-10-03T10:58:17Z }
order: 2
shape: landmass
terrain: { large_cell: 14, small_cell: 5, large: 0.5, small: 0.3, base: 0.22, falloff: 0 }
shores: { grass: 0.5, sand: 0.46, sea_border: false }
start: { land_radius: 0.06, clear_radius: 5.5 }
forest: { cell: 8, threshold: 0.55, density: 0.8, scatter: 0.03, grove_density: 0.7 }
---

# Shape

The same noise as the [island](/maps/island.md) with no falloff, so land runs to every edge and water gathers only in low ground as lakes. Larger noise cells give broader lakes and forests. The middle is always land.

# Later

Mountains and rivers arrive with terrain in Phase 8 of the [roadmap](/roadmap.md); distances here are the longest of any map type, which is where carts (Phase 14) and new settlements (Phase 15) are tested.
