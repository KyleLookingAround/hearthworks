---
type: Blueprint
title: Dock
description: A jetty on the shore where rowing boats are kept. Villagers launch from it and can land on any shore.
tags: [logistics, water]
status: stable
generated: { by: claude/opus-5.5, at: 2026-10-03T12:20:51Z }
color: "#7a5a3a"
order: 8
size: [2, 2]
cost: { planks: 8 }
shore: true
discovery: { need: crossing, mean_seconds: 120 }
---

# Role

Its door opens onto water (`shore: true`): boats are launched there, and a rower can land on any shore. Rowing runs at `boat_speed` ([logistics](/systems/logistics.md)). A traveller who landed somewhere has their boat with them and can row home from the same shore, so one dock is enough to reach a neighbour across water.

# Discovery

Not known at the founding. A settlement whose nearest neighbour lies across water it cannot cross comes up with it (`need: crossing`); see [knowledge](/systems/knowledge.md). The [planner](/systems/planner.md) builds one dock on the shore that faces that neighbour.
