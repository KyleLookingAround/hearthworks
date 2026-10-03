---
type: Blueprint
title: Flax Farm
description: Grows flax on fertile soil.
tags: [production, economy]
status: stable
generated: { by: claude/opus-5.5, at: 2026-10-03T17:39:15Z }
color: "#8ea05a"
order: 18
size: [3, 2]
cost: { planks: 4 }
workers: 1
recipe: { output: { flax: 1 }, seconds: 5 }
deposit: { kind: fertile, radius: 1 }
tools: { speedup: 1.5, wear_cycles: 40 }
seasonal: true
zone: farms
---

# Role

Must stand on or beside fertile soil (`deposit.radius` 1). Works faster with [tools](/goods/tools.md).
