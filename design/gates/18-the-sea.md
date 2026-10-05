---
type: Attested Computation
title: "Gate 18: the sea"
description: On an islands map a settlement founds a colony on another island unscripted; the colony lasts thirty minutes and trades back with its mother town. With charts on, explorers chart unseen islands and colonies go only to charted land.
tags: [gate, roadmap, settlement, water]
status: stable
generated: { by: claude/opus-5.5, at: 2026-10-05T02:33:02Z }
runtime: hearthworks-sim
computation: ../references/scenarios/sea.ts
parameters:
  - { name: seed, type: integer, required: true }
  - { name: seconds, type: integer, required: true }
  - { name: survive_seconds, type: integer, required: true }
  - { name: map, type: string, required: true }
  - { name: size, type: string, required: true }
defaults: { seed: 1847, seconds: 3600, survive_seconds: 1800, map: islands, size: m }
pass_when: { min_colonies: 1, min_colony_survived_seconds: 1800, min_porter_trips_with_mother: 8, min_charts_explorers_charted: 3, min_charts_colonies: 1, max_charts_colonies_uncharted: 0 }
executor:
  resource: ../references/skills/run-gate.md
  receipt: [gate, params, ticks, scenario_sha256, content_hash, metrics]
attester:
  resource: ../references/attesters/thresholds.ts
---

# Computation

The sanctioned scenario is [sea.ts](/references/scenarios/sea.ts). One settlement plans for itself on Islands at size M for an hour of game time, with [settling](/systems/settling.md) and [trade](/systems/trade.md) on and no build calls. A colony is a daughter founded across water. The first one is followed: `colony_survived_seconds` is how long, up to `survive_seconds`, it had people in it, and `porter_trips_with_mother` counts porters crossing between it and its mother, either way.

Then the same world runs again with charts on, as in new games ([the sea](/systems/sea.md)): `charts_explorers_charted` counts explorers who came home with an island new to their settlement, `charts_colonies` the colonies founded on an island their mother had charted when the party set out, and `charts_colonies_uncharted` any founded elsewhere (there must be none). The world's sea has shallows and reefs in both runs.

# Proves

Phase 18 of the [roadmap](/roadmap.md), as proposed: a colony is founded on a second island unscripted, survives 30 game minutes, and trades back to its mother town. Its second pass: explorers chart islands the settlements have not seen, and settlers go only where they know of land.

# Revisions

- 2026-10-04: tightened in place (the second pass): `min_porter_trips_with_mother` 1 to 5. With a dock looked for around every district, standing beside worn paths, and a shore cleared when none is left, seeds 31337 and 99 (whose islands had filled before the dock was thought of) now found colonies at 27 and 29 minutes; on seeds 1847, 42, 99, 2026 and 31337 the first colony lives its half hour with 84 to 96 people and 10 to 14 porter trips with its mother. Seed 7 still founds late (at 51 minutes): it has room at home for longer, so its first daughter stays on its own island. Same scenario and intent.
- 2026-10-05: revised in place (the sea's second pass): the sea has shallows and reefs (map content, so both runs row round reefs and slowly through shallows), and a second run with charts on is added, with `min_charts_explorers_charted` 3, `min_charts_colonies` 1 and `max_charts_colonies_uncharted` 0. The first run keeps charts off, as before. `min_porter_trips_with_mother` tightened from 5 to 8. Seeds 1847, 42, 99 and 2026 pass with 15, 10, 15 and 14 porter trips (11, 11, 16 and 8 before the shallows and reefs); in the charts run, explorers came home with new islands 5, 3, 15, 13, 16 and 16 times, and 1 to 3 colonies were founded on charted land, none elsewhere, on all six seeds. Seeds 7 (a colony at 50 minutes: room at home for longer) and 31337 (no porter crosses between the colony and its mother) still miss the first part, as before; both pass the second.
