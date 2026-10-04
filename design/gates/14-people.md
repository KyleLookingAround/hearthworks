---
type: Attested Computation
title: "Gate 14: people and traditions"
description: A settlement grows by births alone with an expert in every trade, two settlements on different land honour every death by their own custom, and with the year turning each holds its feasts.
tags: [gate, roadmap, people, customs]
status: stable
generated: { by: claude/opus-5.5, at: 2026-10-04T12:46:04Z }
runtime: hearthworks-sim
computation: ../references/scenarios/people.ts
parameters:
  - { name: seed, type: integer, required: true }
  - { name: seconds, type: integer, required: true }
  - { name: map, type: string, required: true }
  - { name: size, type: string, required: true }
defaults: { seed: 1847, seconds: 3600, map: island, size: standard }
pass_when: { min_growth: 1.5, min_expert_share: 1, min_fed_min: 0.6, min_customs_distinct: 2, min_deaths: 5, max_rite_wait_max: 300, max_unhonoured_late: 0, min_feasts_per_year_min: 1, min_feast_kinds: 2 }
executor:
  resource: ../references/skills/run-gate.md
  receipt: [gate, params, ticks, scenario_sha256, content_hash, metrics]
attester:
  resource: ../references/attesters/thresholds.ts
---

# Computation

The sanctioned scenario is [people.ts](/references/scenarios/people.ts), in three parts on the standard map, each an hour of game time with no build calls and [people](/systems/people.md) on.

- **Growth.** One self-planning settlement with newcomers off. `growth` is villagers at the end over its founders; `expert_share` the share of the kinds of workplace standing at the end that have a villager at `expert_at` or better in that trade; `fed_min` the lowest share fed after a five-minute warm-up.
- **Customs.** Two self-planning settlements whose founders are scripted to be old: each dies between 10 and 40 minutes in, so there are deaths to honour. `customs_distinct` counts the customs the two keep at the end; `rite_wait_max` is the longest any death waited for its farewell; `unhonoured_late` counts deaths still waiting at the end after five times `rite_grace_seconds`.
- **Feasts.** Two self-planning settlements with [seasons](/systems/seasons.md) on as well. `feasts_per_year_min` is the fewest feasts either settlement held, over the years run; `feast_kinds` counts the feasts the two keep at the end; `feasts_held` and `feasts_missed` count all feasts held and missed for want of what they need.

# Proves

Phase 14 of the [roadmap](/roadmap.md):

- `growth` at least 1.5 by births alone, an expert in every trade, `fed_min` at Gate 2's 0.6.
- Two settlements whose land differs (at the default seed, one well wooded, one not) keep different customs, and every death is honoured within five minutes.
- With the year turning, each settlement holds a [feast](/systems/people.md) a year or more, and between them they keep both feasts.

At seeds where both settlements' land suggests the same custom, `customs_distinct` is 1 by design, and so, as the same land suggests the same feast, is `feast_kinds`; the default seed is one where they differ.

# Revisions

- 2026-10-04: a third part, feasts (the second pass: traditions beyond the dead), with two added checks: `min_feasts_per_year_min` 1 and `min_feast_kinds` 2. The first two parts are unchanged (they run without seasons, so no feast is held in them). On seeds 1847, 7, 42, 99, 2026 and 31337 each settlement held 1 to 2.5 feasts a year (1847: 2), 0 to 2 missed in all; both feasts are kept wherever the customs differ, one where they do not (seeds 99 and 2026, as for customs).
