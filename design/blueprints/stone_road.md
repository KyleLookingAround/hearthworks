---
type: Blueprint
title: Stone Road
description: A road paved in stone, the fastest ground there is; a settlement repaves its busiest road in stone it can spare.
tags: [logistics, roads]
status: stable
generated: { by: claude/opus-5.5, at: 2026-10-04T12:49:27Z }
color: "#6f6a62"
order: 36.5
size: [1, 1]
paves: true
road: true
stone: true
cost: { stone: 1 }
discovery: { need: traffic, mean_seconds: 600, after: [road] }
---

# Role

A tile of stone road is walked `stone_road_speed` times as fast as open ground (a [road](/blueprints/road.md) is `road_speed`), and a handcart or ox cart rolls on it as on any road ([logistics](/systems/logistics.md)). A settlement that knows it repaves the busiest of its roads not yet of stone, the whole strip at once, at `cost` a tile, when its stores hold enough stone to spare and all the strip needs ([roads](/systems/roads.md)). The player can lay it by hand, free and at once, over a road, a path or open ground, once the settlement knows how.

# Discovery

Thought of only by a settlement that knows the Road, under the same strain (`traffic`), more slowly.
