---
type: Blueprint
title: Windmill
description: Grinds the grain for the bakeries around it, so they bake faster; a blueprint of the Age of Clockwork's own.
tags: [production, ages, food]
status: draft
generated: { by: claude/opus-5.5, at: 2026-10-05T02:21:49Z }
color: "#c9b48a"
order: 13.5
size: [2, 2]
cost: { planks: 12 }
workers: 1
speeds: { types: [bakery], radius: 12, factor: 1.5 }
discovery: { need: bread, mean_seconds: 300 }
---

# Role

While its miller is at work, every [Bakery](/blueprints/bakery.md) of its settlement within `speeds.radius` tiles bakes `speeds.factor` times as fast: the grain comes ground, and the bakers only bake. A bakery near two windmills is no faster than near one. It makes nothing of its own; it is a hand spent to make the bakers' hands go further.

# Discovery

It is the [Age of Clockwork](/eras/clockwork.md)'s own: only a settlement of that age or later thinks of it ([ages](/systems/ages.md)), under the need `bread` (its planner short of bread), though a neighbour may teach it to any settlement. The planner builds one where `mill_min` bakeries or more stand with no windmill in reach, by as many of them as it can ([planner](/systems/planner.md)).
