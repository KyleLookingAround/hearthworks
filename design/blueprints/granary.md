---
type: Blueprint
title: Granary
description: "A stone store for food: keeps grain, bread, fish, flax and the fresh foods from spoiling."
tags: [production, economy]
status: stable
generated: { by: claude/opus-5.5, at: 2026-10-06T09:07:23Z }
color: "#c4a86a"
order: 20
size: [3, 3]
cost: { planks: 8, stone: 4 }
storage: true
capacity: 400
keeps: [wheat, bread, fish, flax, vegetables, fruit, milk, meat]
---

# Role

Storage for food only (`keeps`), up to `capacity` units, where nothing spoils. Built of planks and rough [stone](/goods/stone.md): with cut stone it was never built, since a settlement plans no mason for a store against rot ([planner](/systems/planner.md)).
