---
type: Blueprint
title: Town Hall
description: Where a planner works; with one at their desk the settlement builds more than one thing at a time, and a master planner more still.
tags: [planner, people, settlement]
status: draft
generated: { by: claude/opus-5.5, at: 2026-10-05T01:38:14Z }
color: "#8a6a4a"
order: 23.5
size: [3, 3]
cost: { planks: 14 }
workers: 1
hall: true
---

# Role

The settlement's planner, a villager like any other, works here ([planner](/systems/planner.md)). Without a hall a settlement plans one building of its own at a time: it waits for each site to finish before it plans the next. While the hall's planner is at their desk it may keep `hall_sites` more of its own sites open at once, and `hall_master_sites` more again once the planner's skill reaches `expert_at` ([people](/systems/people.md)): planning is a trade, learned with practice, faster from a master.

# When

With [people](/systems/people.md) on, the planner wants a hall at `hall_weight` once the settlement is a village. Every settlement knows how to build one from its founding.
