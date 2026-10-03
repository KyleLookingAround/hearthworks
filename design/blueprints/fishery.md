---
type: Blueprint
title: Fishery
description: Catches fish in fishing water within four tiles.
tags: [production, economy]
status: stable
generated: { by: claude/opus-5.5, at: 2026-10-03T16:24:52Z }
color: "#4f8aa0"
order: 17
size: [2, 2]
cost: { planks: 6 }
workers: 1
recipe: { output: { fish: 1 }, seconds: 5 }
deposit: { kind: fish, radius: 4 }
zone: farms
---

# Role

Must stand within `deposit.radius` of fishing water.
