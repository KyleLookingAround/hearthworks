---
type: Blueprint
title: Quarry
description: Cuts rough stone from a stone deposit within three tiles.
tags: [production, economy]
status: stable
generated: { by: claude/opus-5.5, at: 2026-10-03T16:24:52Z }
color: "#8d877b"
order: 11
size: [2, 2]
cost: { planks: 4 }
workers: 1
recipe: { output: { stone: 1 }, seconds: 6 }
deposit: { kind: stone, radius: 3 }
tools: { speedup: 1.5, wear_cycles: 40 }
zone: workshops
---

# Role

Must stand within `deposit.radius` of a stone deposit ([map](/systems/map.md), terrain). Works faster with [tools](/goods/tools.md).
