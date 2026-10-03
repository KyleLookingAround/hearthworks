---
type: Blueprint
title: Cart Shed
description: Keeps handcarts for long hauls. A carter takes one for a long job and brings it back after; six goods a trip, quicker on roads, slower off them.
tags: [logistics, vehicles]
status: stable
generated: { by: claude/opus-5.5, at: 2026-10-03T21:35:39Z }
color: "#8a6a4a"
order: 9
size: [3, 2]
cost: { planks: 12 }
carts: 4
discovery: { need: distance, mean_seconds: 180 }
---

# Role

Holds `carts` handcarts. A villager taking a job of at least `cart_min_tiles` (walk to the goods plus the haul) within `cart_reach` of a shed with a cart free takes one: they carry `cart_carry` instead of `villager_carry`, move `cart_road_speed` times as fast on roads, `cart_path_speed` on paths and bridges and `cart_rough_speed` elsewhere ([logistics](/systems/logistics.md)). The cart goes back when the load is delivered.

# Discovery

The need `distance` grows with how far a settlement's deliveries go on average ([knowledge](/systems/knowledge.md)).
