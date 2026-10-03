---
type: Attested Computation
title: "Gate 3: bots carry a real share"
description: With a Courier Depot beside storage, bots make at least 30% of deliveries in 15 game minutes and nobody leaves.
tags: [gate, roadmap, automation]
status: stable
generated: { by: claude/opus-5.5, at: 2026-10-03T08:15:00Z }
runtime: hearthworks-sim
computation: ../references/scenarios/couriers.ts
parameters:
  - { name: seed, type: integer, required: true }
  - { name: seconds, type: integer, required: true }
defaults: { seed: 1847, seconds: 900 }
pass_when: { min_depot_built: 1, min_bot_share: 0.3, max_departures: 0 }
executor:
  resource: ../references/skills/run-gate.md
  receipt: [gate, params, ticks, scenario_sha256, content_hash, metrics]
attester:
  resource: ../references/attesters/thresholds.ts
---

# Computation

The sanctioned scenario is [couriers.ts](/references/scenarios/couriers.ts): wood and bread chains plus a [Courier Depot](/blueprints/depot.md) placed north-east of the storage yard.

# Proves

Phase 3 of the [roadmap](/roadmap.md): automation takes real work off villagers. The same [job board](/systems/logistics.md) serves both kinds of carrier.
