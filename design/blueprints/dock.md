---
type: Blueprint
title: Dock
description: A jetty on the shore where rowing boats are kept. Villagers launch from it and can land on any shore.
tags: [logistics, water]
status: stable
generated: { by: claude/opus-5.5, at: 2026-10-05T07:30:58Z }
color: "#7a5a3a"
order: 8
size: [2, 2]
cost: { planks: 8 }
shore: true
rite: ship
discovery: { need: crossing, mean_seconds: 120 }
---

# Role

Its door opens onto water (`shore: true`), on whichever side it faces, with open land beside the door for people to reach it: boats are launched there, and a rower can land on any shore. Rowing runs at `boat_speed` ([logistics](/systems/logistics.md)). A traveller who landed somewhere has their boat with them and can row home from the same shore, so one dock is enough to reach a neighbour across water.

# Its boats

With [ships](/systems/sea.md) on, a dock is built with `dock_boats` boats for its settlement's fleet, and only the settlement's own people launch from it, each in a boat of their fleet; a [Shipyard](/blueprints/shipyard.md) builds more. Its inspector names the boats moored at the jetty and how many are out. Without ships (older games), anyone launches from any dock, as before.

# Ship burial

A village whose custom is [ship burial](/systems/people.md) sets its dead out to sea from its dock, in a boat of `ship_planks` planks.

# Discovery

Not known at the founding. A settlement whose nearest neighbour lies across water it cannot cross comes up with it (`need: crossing`); see [knowledge](/systems/knowledge.md). The [planner](/systems/planner.md) builds one dock on the shore that faces that neighbour.
