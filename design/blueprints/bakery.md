---
type: Blueprint
title: Bakery
description: Bakes one wheat into one loaf. Houses run on bread.
tags: [food, production]
status: stable
generated: { by: claude/opus-5.5, at: 2026-10-03T08:15:00Z }
color: "#97523a"
order: 5
size: [2, 2]
cost: { planks: 8 }
workers: 1
recipe: { input: { wheat: 1 }, output: { bread: 1 }, seconds: 5 }
keep_stocked: { wheat: 4 }
zone: workshops
---

# Role

Turns [wheat](/goods/wheat.md) into [bread](/goods/bread.md).

# Balance note

One bakery makes 12 loaves a minute. Each villager eats about 1.3 a minute at the current [needs](/systems/needs.md) tuning, so one bakery feeds roughly nine villagers. The [sustain gate](/gates/02-sustain-town.md) checks this holds in play.
