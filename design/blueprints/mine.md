---
type: Blueprint
title: Mine
description: Digs iron ore from an iron deposit within three tiles.
tags: [production, economy]
status: stable
generated: { by: claude/opus-5.5, at: 2026-10-03T16:24:52Z }
color: "#5d4e4a"
order: 15
size: [2, 2]
cost: { planks: 8 }
workers: 1
recipe: { output: { iron_ore: 1 }, seconds: 8 }
deposit: { kind: iron, radius: 3 }
tools: { speedup: 1.5, wear_cycles: 40 }
zone: workshops
---

# Role

Must stand within `deposit.radius` of an iron deposit, found on and beside rock and in small outcrops. Works faster with [tools](/goods/tools.md).
