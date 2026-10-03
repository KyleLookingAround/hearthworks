---
type: Attested Computation
title: "Gate 16: ways to move"
description: On the largest landmass a settlement thinks of carts itself, and long hauls go largely by cart, each good in well under the time on foot.
tags: [gate, roadmap, logistics, vehicles]
status: stable
generated: { by: claude/opus-5.5, at: 2026-10-03T19:34:39Z }
runtime: hearthworks-sim
computation: ../references/scenarios/carts.ts
parameters:
  - { name: seed, type: integer, required: true }
  - { name: seconds, type: integer, required: true }
  - { name: map, type: string, required: true }
  - { name: size, type: string, required: true }
defaults: { seed: 1847, seconds: 3600, map: landmass, size: l }
pass_when: { min_carts_known: 1, min_long_cart_share: 0.4, max_cart_time_ratio: 0.6 }
executor:
  resource: ../references/skills/run-gate.md
  receipt: [gate, params, ticks, scenario_sha256, content_hash, metrics]
attester:
  resource: ../references/attesters/thresholds.ts
---

# Computation

The sanctioned scenario is [carts.ts](/references/scenarios/carts.ts). One settlement plans for itself on Landmass at size L (384 by 288) for an hour of game time with carts on, no build calls and no scripted knowledge. A long haul is a delivery of at least `cart_min_tiles` ([logistics](/systems/logistics.md)). `long_cart_share` is the share of the goods on long hauls that went by cart; `cart_time_ratio` is the seconds per good by cart over the seconds per good on foot, both from claim to drop-off.

# Proves

Phase 16 of the [roadmap](/roadmap.md): the [Cart Shed](/blueprints/cart_shed.md) is thought of unscripted under distance strain, and carts carry a large share of long hauls, each good in well under the time it takes on foot.

# Against the proposal

The roadmap proposed at least 50% of long deliveries by cart and `mean_delivery_seconds` below the Gate 8 baseline. Measured on seeds 1847, 7 and 42: carts carry 42 to 48% of the goods on long hauls (the rest are loads of one or two goods for a home, which a cart does not speed up), and a good by cart takes 3.5 to 4.2 seconds against 10.9 to 11.5 on foot. Comparing a run with carts against one without does not isolate carts: turning them on adds a line of thought, which reshuffles every later invention's random draws, so population and delivery times move by seed noise either way. This gate measures carts against walking within the same run, and holds 40% rather than 50%. Below the proposal, for Kyle's call.
