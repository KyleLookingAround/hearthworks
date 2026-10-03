---
type: Blueprint
title: Courier Depot
description: Winds up three courier bots that haul goods within twelve tiles. They never eat, so villagers are free to work.
tags: [logistics, automation]
status: stable
generated: { by: claude/opus-5.5, at: 2026-10-03T10:29:28Z }
color: "#55666e"
order: 7
size: [2, 2]
cost: { planks: 20 }
couriers: { count: 3, radius: 12 }
discovery: { need: hauling, mean_seconds: 450 }
---

# Role

The first automation tier. Bots take jobs from the same [job board](/systems/logistics.md) as villagers, but only when both ends sit inside the depot's radius.

Once a bot exists, every villager may take a job at a workplace; without bots one villager always stays a carrier.

# Discovery

Not known at the founding. A settlement whose carriers are run off their feet comes up with it (`discovery: { need: hauling }`, on average after `mean_seconds` of strain), and visitors carry it to neighbours. See [knowledge](/systems/knowledge.md). The [planner](/systems/planner.md) places depots where their bots reach buildings no bots reach yet.
