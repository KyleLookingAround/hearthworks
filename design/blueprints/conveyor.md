---
type: Blueprint
title: Conveyor
description: A belt laid along the lanes on which goods ride, with no hands, between the buildings whose doors open beside it; a blueprint of the Age of Clockwork's own.
tags: [logistics, automation, ages]
status: draft
generated: { by: claude/opus-5.5, at: 2026-10-05T03:35:56Z }
color: "#4a4038"
order: 7.5
size: [1, 1]
paves: true
belt: true
cost: { planks: 1 }
discovery: { need: conveying, mean_seconds: 450, after: [depot] }
---

# Role

The machine tier after [courier bots](/blueprints/depot.md). Bots haul only within a short reach of their depot; a conveyor runs as far as it is laid. A load (up to the [conveyors](/systems/conveyors.md)' `carry`) leaves a building onto the belt and rides it, at `speed` tiles a second, to another building beside the same belt, where it comes off: a storage yard's bread to the homes along the street, a farm's wheat to the yard, planks to a site. Nobody walks, and nobody is fed for it. People step across a belt as across the ground beneath it; nothing is built on one.

# Discovery

It is the [Age of Clockwork](/eras/clockwork.md)'s own: only a settlement of that age or later thinks of it ([ages](/systems/ages.md)), and only once it knows the Courier Depot, under the need `conveying`: its depots stand and its carriers are still run off their feet, hauling where its bots cannot reach. A neighbour may teach it to anyone. A planner lays it along its lanes from a storage yard's door at `cost` a tile ([conveyors](/systems/conveyors.md)); the player can lay it by hand, free and at once, anywhere a road could go.
