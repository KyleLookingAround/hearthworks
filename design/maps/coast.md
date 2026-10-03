---
type: Map Type
title: Coast
description: Land on the west, open sea on the east, with bays and headlands along the shore.
tags: [map]
status: stable
generated: { by: claude/opus-5.5, at: 2026-10-03T10:58:17Z }
order: 3
shape: coast
coastline: 0.62
terrain: { large_cell: 9, small_cell: 4, large: 0.5, small: 0.3, base: 0.45, falloff: 1.6 }
shores: { grass: 0.5, sand: 0.45, sea_border: false }
start: { land_radius: 0.06, clear_radius: 5.5 }
forest: { cell: 6, threshold: 0.56, density: 0.8, scatter: 0.03, grove_density: 0.7 }
---

# Shape

Height falls off only east of `coastline` (a share of the map's width), so the west is solid land running to the map edge and the east is sea; the noise cuts bays and headlands into the shore.

# Later

The shore is where fishing (Phase 11) and ports (Phase 18) will go; see the [roadmap](/roadmap.md).
