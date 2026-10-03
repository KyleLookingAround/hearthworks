---
type: Attested Computation
title: "Gate 14: people and traditions"
description: A settlement grows by births alone with an expert in every trade, and two settlements on different land honour every death by their own custom.
tags: [gate, roadmap, people, customs]
status: stable
generated: { by: claude/opus-5.5, at: 2026-10-03T18:46:34Z }
runtime: hearthworks-sim
computation: ../references/scenarios/people.ts
parameters:
  - { name: seed, type: integer, required: true }
  - { name: seconds, type: integer, required: true }
  - { name: map, type: string, required: true }
  - { name: size, type: string, required: true }
defaults: { seed: 1847, seconds: 3600, map: island, size: standard }
pass_when: { min_growth: 1.5, min_expert_share: 1, min_fed_min: 0.6, min_customs_distinct: 2, min_deaths: 5, max_rite_wait_max: 300, max_unhonoured_late: 0 }
executor:
  resource: ../references/skills/run-gate.md
  receipt: [gate, params, ticks, scenario_sha256, content_hash, metrics]
attester:
  resource: ../references/attesters/thresholds.ts
---

# Computation

The sanctioned scenario is [people.ts](/references/scenarios/people.ts), in two parts on the standard map, each an hour of game time with no build calls and [people](/systems/people.md) on.

- **Growth.** One self-planning settlement with newcomers off. `growth` is villagers at the end over its founders; `expert_share` the share of the kinds of workplace standing at the end that have a villager at `expert_at` or better in that trade; `fed_min` the lowest share fed after a five-minute warm-up.
- **Customs.** Two self-planning settlements whose founders are scripted to be old: each dies between 10 and 40 minutes in, so there are deaths to honour. `customs_distinct` counts the customs the two keep at the end; `rite_wait_max` is the longest any death waited for its farewell; `unhonoured_late` counts deaths still waiting at the end after five times `rite_grace_seconds`.

# Proves

Phase 14 of the [roadmap](/roadmap.md):

- `growth` at least 1.5 by births alone, an expert in every trade, `fed_min` at Gate 2's 0.6.
- Two settlements whose land differs (at the default seed, one well wooded, one not) keep different customs, and every death is honoured within five minutes.

At seeds where both settlements' land suggests the same custom, `customs_distinct` is 1 by design; the default seed is one where it differs.
