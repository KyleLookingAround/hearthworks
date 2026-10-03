---
type: Blueprint
title: Sawmill
description: Cuts one log into one plank. Planks build everything.
tags: [wood, production]
status: stable
generated: { by: claude/opus-5.5, at: 2026-10-03T08:15:00Z }
color: "#6d5a44"
order: 3
size: [2, 2]
cost: { planks: 6 }
workers: 1
recipe: { input: { logs: 1 }, output: { planks: 1 }, seconds: 4 }
keep_stocked: { logs: 4 }
nuisance: { radius: 5, amount: 0.5 }
zone: workshops
---

# Role

Turns [logs](/goods/logs.md) into [planks](/goods/planks.md). Carriers keep four logs waiting at the saw.

The saw is loud: homes within `nuisance.radius` lose `nuisance.amount` from their [surroundings](/systems/needs.md), and the [planner](/systems/planner.md) keeps homes and sawmills apart.
