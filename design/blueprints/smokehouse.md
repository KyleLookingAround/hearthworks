---
type: Blueprint
title: Smokehouse
description: Smokes fish over a log fire into food that keeps all winter.
tags: [production, food, seasons]
status: stable
generated: { by: claude/opus-5.5, at: 2026-10-03T17:14:13Z }
color: "#7a5b45"
order: 22
size: [2, 2]
cost: { planks: 6 }
workers: 1
recipe: { input: { fish: 2, logs: 1 }, output: { smoked_fish: 2 }, seconds: 8 }
keep_stocked: { fish: 4, logs: 2 }
nuisance: { radius: 3, amount: 0.2 }
zone: workshops
---

# Role

Turns [fish](/goods/fish.md) and a [log](/goods/logs.md) into [smoked fish](/goods/smoked_fish.md), the preserved food of winter ([seasons](/systems/seasons.md)).
