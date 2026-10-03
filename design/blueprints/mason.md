---
type: Blueprint
title: Mason
description: Dresses two rough stones into one block of cut stone.
tags: [production, economy]
status: stable
generated: { by: claude/opus-5.5, at: 2026-10-03T16:24:52Z }
color: "#b2ab9b"
order: 12
size: [2, 2]
cost: { planks: 6 }
workers: 1
recipe: { input: { stone: 2 }, output: { cut_stone: 1 }, seconds: 8 }
keep_stocked: { stone: 4 }
nuisance: { radius: 3, amount: 0.3 }
zone: workshops
---

# Role

Turns [stone](/goods/stone.md) into [cut stone](/goods/cut_stone.md). The chisels ring: a small nuisance to homes nearby.
