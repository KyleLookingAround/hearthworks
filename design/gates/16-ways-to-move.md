---
type: Attested Computation
title: "Gate 16: ways to move"
description: On the largest landmass a settlement thinks of carts itself, long hauls go largely by cart, each good in well under the time on foot, and carts hand goods on at the yards of the districts they go to.
tags: [gate, roadmap, logistics, vehicles]
status: stable
generated: { by: claude/opus-5.5, at: 2026-10-06T02:30:00Z }
runtime: hearthworks-sim
computation: ../references/scenarios/carts.ts
parameters:
  - { name: seed, type: integer, required: true }
  - { name: seconds, type: integer, required: true }
  - { name: map, type: string, required: true }
  - { name: size, type: string, required: true }
defaults: { seed: 1847, seconds: 3600, map: landmass, size: l }
pass_when: { min_carts_known: 1, min_long_cart_share: 0.5, max_cart_time_ratio: 0.6, min_handed_on: 100 }
executor:
  resource: ../references/skills/run-gate.md
  receipt: [gate, params, ticks, scenario_sha256, content_hash, metrics]
attester:
  resource: ../references/attesters/thresholds.ts
---

# Computation

The sanctioned scenario is [carts.ts](/references/scenarios/carts.ts). One settlement plans for itself on Landmass at size L (384 by 288) for an hour of game time with carts on, no build calls and no scripted knowledge. A long haul is a delivery of at least `cart_min_tiles` ([logistics](/systems/logistics.md)). `long_cart_share` is the share of the goods on long hauls that went by cart; `cart_time_ratio` is the seconds per good by cart over the seconds per good on foot, both from claim to drop-off. The receipt also reports [ox carts](/blueprints/ox_barn.md): barns standing, trips, `long_ox_share` (the long-haul goods by ox cart, counted within `long_cart_share`) and `ox_time_ratio`; none of them is held to a threshold. It also reports the goods by each way (`foot_goods`, `cart_goods`, `ox_goods`, `bot_goods`, each leg counted) and `handed_on`: goods a cart (or belt) handed on at the storage yard of the district they were bound for, to be taken on on foot ([logistics](/systems/logistics.md), hubs), which must reach `min_handed_on`.

# Proves

Phase 16 of the [roadmap](/roadmap.md): the [Cart Shed](/blueprints/cart_shed.md) is thought of unscripted under distance strain, and carts carry a large share of long hauls, each good in well under the time it takes on foot. Deliveries go in legs unscripted: carts take the rest of a cartload, and a district's stock, to its yard, and its carriers take them on on foot.

# Against the proposal

The roadmap proposed at least 50% of long deliveries by cart and `mean_delivery_seconds` below the Gate 8 baseline. When the phase was built carts carried 42 to 48% of the goods on long hauls on seeds 1847, 7 and 42 (36 to 42% on six seeds after the balanced economy): the rest were loads of one or two goods for a home or a workshop, which a cart does not speed up. With [rounds and cartloads](/systems/logistics.md) (the second pass) a cart fills up for several homes near its first drop and brings a workshop a cartload, and carts carry 49 to 59% of long-haul goods on seeds 1847, 7, 42, 99, 2026 and 31337 (mean 54%, against 38% before), a good by cart in 0.31 to 0.43 of the time on foot. The share now meets the proposal on its seed. `mean_delivery_seconds` rises (9.3 to 10.0 seconds a delivery: a round's later drops count from its claim), and a run with carts against one without still does not isolate carts (turning them on reshuffles every later invention's random draws), so this gate measures carts against walking within the same run.

# Revisions

- 2026-10-04: tightened in place with cart rounds and cartloads (the second pass): `min_long_cart_share` 0.4 to 0.5, the roadmap's proposal. Same scenario and intent.
- 2026-10-04: the receipt reports ox carts (`ox_barns`, `ox_trips`, `long_ox_share`, `ox_time_ratio`), with no threshold. Same thresholds and intent.
- 2026-10-06: deliveries in legs (the second pass): the receipt reports the goods by each way and `handed_on`, held to `min_handed_on: 100` (a new check; nothing loosened). On the twelve usual seeds, three draws each, an hour: 121 to 695 goods handed on (430 on the default seed), `long_cart_share` 0.57 over the 36 worlds against 0.56 before. Same scenario world and intent. River boats are not in it: see [logistics](/systems/logistics.md).
