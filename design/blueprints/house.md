---
type: Blueprint
title: House
description: Home for three villagers. Keeps a small stock of bread on the shelf.
tags: [housing, needs]
status: stable
generated: { by: claude/opus-5.5, at: 2026-10-03T08:15:00Z }
color: "#a9573f"
order: 1
size: [2, 2]
cost: { planks: 6 }
homes: 3
keep_stocked: { bread: 3 }
---

# Role

Housing caps the population. A newcomer arrives only when a house has a free bed and [mood](/systems/needs.md) is high enough.

Each resident eats one loaf of [bread](/goods/bread.md) on the cadence set in [needs](/systems/needs.md). When the shelf stays empty too long, one resident leaves.
