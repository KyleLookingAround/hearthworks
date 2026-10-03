---
type: Blueprint
title: Brickworks
description: "Fires clay with logs into bricks: a two-input recipe."
tags: [production, economy]
status: stable
generated: { by: claude/opus-5.5, at: 2026-10-03T16:24:52Z }
color: "#a64a34"
order: 14
size: [3, 2]
cost: { planks: 8 }
workers: 1
recipe: { input: { clay: 1, logs: 1 }, output: { bricks: 2 }, seconds: 8 }
keep_stocked: { clay: 4, logs: 2 }
nuisance: { radius: 4, amount: 0.3 }
zone: workshops
---

# Role

Turns one [clay](/goods/clay.md) and one [log](/goods/logs.md) into two [bricks](/goods/bricks.md). The kiln smokes: a nuisance to homes nearby.
