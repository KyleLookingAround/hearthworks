---
type: Blueprint
title: Ox Barn
description: Keeps oxen and their carts for the longest hauls. Twelve goods a trip, slower than a handcart; each trip eats a sack of wheat.
tags: [logistics, vehicles]
status: stable
generated: { by: claude/opus-5.5, at: 2026-10-04T11:49:05Z }
color: "#7a5a3a"
order: 9.5
size: [4, 3]
cost: { planks: 20 }
keep_stocked: { wheat: 4 }
oxen: 2
discovery: { need: long_hauls, mean_seconds: 300, after: [cart_shed] }
---

# Role

Holds `oxen` ox carts. A villager taking a job of at least `ox_min_tiles` (walk to the goods plus the haul) within `cart_reach` of a barn with an ox free and a sack of feed takes an ox cart: they carry `ox_carry` goods, and move `ox_road_speed` times as fast on roads, `ox_path_speed` on paths and bridges and `ox_rough_speed` elsewhere ([logistics](/systems/logistics.md)). Each trip eats `ox_feed` wheat from the barn's stock, which carriers keep topped up like a home's bread. An ox cart goes round homes and brings workshops a load as a handcart does, twice the size. Shorter jobs, and long ones with every ox out or no feed, take a [handcart](/blueprints/cart_shed.md) as before.

# Discovery

Thought of only by a settlement that knows the Cart Shed, under the need `long_hauls`: its deliveries averaging beyond `long_haul_from` tiles ([knowledge](/systems/knowledge.md)).
