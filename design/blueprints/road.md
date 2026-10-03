---
type: Blueprint
title: Road
description: A planned road, laid as a long straight strip through a settlement; faster than paths, most of all for carts.
tags: [logistics, roads]
status: stable
generated: { by: claude/opus-5.5, at: 2026-10-03T21:35:39Z }
color: "#9a9488"
order: 36
size: [1, 1]
paves: true
road: true
cost: { planks: 1 }
discovery: { need: traffic, mean_seconds: 240 }
---

# Role

A road tile is walked `road_speed` times as fast as open ground (paths are `path_speed`), and a handcart rolls `cart_road_speed` times as fast on it ([logistics](/systems/logistics.md)). Planners lay roads as long straight strips, at `cost` a tile, cutting through what stands in their line ([roads](/systems/roads.md)); the player can lay road tiles by hand, free and at once, once the settlement knows how.

Until Phase 21 this concept was the worn, paved tile, which is now the [Path](/blueprints/path.md).

# Discovery

Thought of under the need `traffic` ([knowledge](/systems/knowledge.md)): a village or town whose deliveries run long, from `traffic_from` tiles on average to full strain `traffic_span` tiles beyond ([roads](/systems/roads.md)).
