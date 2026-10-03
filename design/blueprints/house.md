---
type: Blueprint
title: Cottage
description: A small home for three villagers on a roomy plot, the first rung of the ladder of homes. Keeps a small stock of bread on the shelf.
tags: [housing, needs]
status: stable
generated: { by: claude/opus-5.5, at: 2026-10-03T15:26:20Z }
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

# Ladder

The cottage is the smallest home: 0.75 beds a tile. A village builds [Family Houses](/blueprints/family_house.md) and a town [Terraces](/blueprints/terrace.md); a town tears down an old cottage for a terrace when it outgrows it ([planner](/systems/planner.md), replanning). Its id stays `house` so older saves and gates still find it.
