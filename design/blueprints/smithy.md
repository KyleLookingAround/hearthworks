---
type: Blueprint
title: Smithy
description: "Forges iron ore with logs into tools: a two-input recipe."
tags: [production, economy]
status: stable
generated: { by: claude/opus-5.5, at: 2026-10-03T16:24:52Z }
color: "#59616a"
order: 16
size: [2, 2]
cost: { planks: 6, stone: 4 }
workers: 1
recipe: { input: { iron_ore: 1, logs: 1 }, output: { tools: 1 }, seconds: 10 }
keep_stocked: { iron_ore: 3, logs: 2 }
nuisance: { radius: 4, amount: 0.4 }
zone: workshops
---

# Role

Turns [iron ore](/goods/iron_ore.md) and a [log](/goods/logs.md) into [tools](/goods/tools.md). The anvil is loud: a nuisance to homes nearby.
