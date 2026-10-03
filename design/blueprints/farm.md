---
type: Blueprint
title: Farm
description: Grows wheat for the bakery.
tags: [food, production]
status: stable
generated: { by: claude/opus-5.5, at: 2026-10-03T17:39:15Z }
color: "#c2a046"
order: 4
size: [3, 2]
cost: { planks: 4 }
workers: 1
recipe: { output: { wheat: 1 }, seconds: 4 }
tools: { speedup: 1.5, wear_cycles: 40 }
seasonal: true
zone: farms
---

# Role

Produces [wheat](/goods/wheat.md) for the [Bakery](/blueprints/bakery.md). With [seasons](/systems/seasons.md) on it rests in winter and its worker goes carrying. No soil model yet.
