---
type: Blueprint
title: Seed Garden
description: Scholars' beds where the best plants are bred for seed, so the farms, gardens and orchards around it bear a quarter more. Only scholars think of it.
tags: [production, food, learning]
status: draft
generated: { by: claude/opus-5.5, at: 2026-10-05T21:56:14Z }
color: "#7fa65a"
order: 4.4
size: [3, 2]
cost: { planks: 12 }
workers: 1
mills: { types: [farm, garden, orchard], radius: 12, factor: 1.25, boon: better seed }
discovery: { need: bread, mean_seconds: 300, university: true }
---

# Role

While its seed keeper is at work, every [Farm](/blueprints/farm.md), [Garden](/blueprints/garden.md) and [Orchard](/blueprints/orchard.md) of its settlement within `mills.radius` tiles sows the seed bred here and bears `mills.factor` times as much from each harvest (the part beyond a whole carries over to the next). A farm near two seed gardens bears no more than near one. It makes nothing of its own: like the [Windmill](/blueprints/windmill.md), whose rule it shares ([production](/systems/production.md)), it is a hand spent so the fields feed more mouths. The windmill makes each sack of wheat go further at the bakery; the seed garden makes more sacks, so the two work together.

# Discovery

Thought of under the need `bread` (its planner short of bread), and only while the settlement's [University](/blueprints/university.md) has a scholar at work ([knowledge](/systems/knowledge.md)): a village of hands alone sows the seed it saved, and never thinks to breed it. A neighbour may still teach it to a settlement with no university. The [planner](/systems/planner.md) builds one where `mill_min` farms, gardens or orchards stand with none in reach, by as many of them as it can.
