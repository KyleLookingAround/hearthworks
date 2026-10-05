---
type: Blueprint
title: Windmill
description: Grinds the grain for the bakeries around it, so each sack of wheat makes half as much bread again; a blueprint of the Age of Clockwork's own.
tags: [production, ages, food]
status: draft
generated: { by: claude/opus-5.5, at: 2026-10-05T02:21:49Z }
color: "#c9b48a"
order: 13.5
size: [2, 2]
cost: { planks: 12 }
workers: 1
mills: { types: [bakery], radius: 12, factor: 1.5 }
discovery: { need: bread, mean_seconds: 300 }
---

# Role

While its miller is at work, every [Bakery](/blueprints/bakery.md) of its settlement within `mills.radius` tiles gets `mills.factor` times the bread from each batch: the grain comes finely ground, and a sack of wheat goes further (the part of a loaf beyond the whole carries over to the next batch). A bakery near two windmills gets no more than near one. The windmill makes nothing of its own: it is a hand spent so that the farms' wheat feeds more mouths.

# Discovery

It is the [Age of Clockwork](/eras/clockwork.md)'s own: only a settlement of that age or later thinks of it ([ages](/systems/ages.md)), under the need `bread` (its planner short of bread), though a neighbour may teach it to any settlement. The planner builds one where `mill_min` bakeries or more stand with no windmill in reach, by as many of them as it can ([planner](/systems/planner.md)). (A first windmill that made bakeries bake faster rather than further was tried and dropped: bakeries wait on wheat, not on time, so it made no more bread and cost a hand: [log](/log.md), 2026-10-05.)
