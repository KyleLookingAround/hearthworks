---
type: Blueprint
title: Shipyard
description: A slipway where a shipwright builds rowing boats from planks for the settlement's fleet, while its people wait ashore for one.
tags: [logistics, water]
status: draft
generated: { by: claude/opus-5.5, at: 2026-10-06T06:43:46Z }
color: "#8b6b4a"
order: 8.5
size: [3, 2]
cost: { planks: 10 }
workers: 1
recipe: { input: { planks: 6 }, output: {}, seconds: 90 }
keep_stocked: { planks: 6 }
shipyard: true
option: ships
zone: workshops
discovery: { need: boats, mean_seconds: 180, after: [dock] }
---

# Role

With [ships](/systems/sea.md) on, boats belong to a settlement: a [Dock](/blueprints/dock.md) comes with one (`dock_boats`), and the shipyard builds the rest. Its shipwright turns `recipe.input` planks into a boat every `recipe.seconds` (at their skill's pace, and the settlement's working hours), while the settlement has a dock and fewer boats than it wants: one more than it has while its people have lately stayed ashore for want of a free boat, never more than one for every `villagers_per_boat` people nor `fleet_max`. With the fleet full, the shipwright rests and in time goes carrying. Each boat gets a name, and the first boat and every launch go into the chronicle. The boats are kept at the settlement's docks, and its inspector names those moored.

# Discovery

Not known at the founding, and only with ships on. A settlement that knows the dock comes up with it when its people have lately had to stay ashore for want of a free boat (`need: boats`, within `boatless_memory_seconds`); see [knowledge](/systems/knowledge.md). The [planner](/systems/planner.md) builds one shipyard while that need is fresh and its fleet wants boats (`shipyard_weight`).
