---
type: Attested Computation
title: "Gate 15: learning"
description: A library keeps a craft its settlement would otherwise forget, a university brings a discovery sooner on at least five of six seeds, some discoveries come only with a university (and do, unscripted, in a new game), and readers learn from libraries without a visitor.
tags: [gate, roadmap, learning, knowledge]
status: stable
generated: { by: claude/opus-5.5, at: 2026-10-05T21:56:14Z }
runtime: hearthworks-sim
computation: ../references/scenarios/learning.ts
parameters:
  - { name: seed, type: integer, required: true }
  - { name: keep_seconds, type: integer, required: true }
  - { name: inquiry_seconds, type: integer, required: true }
  - { name: map, type: string, required: true }
  - { name: size, type: string, required: true }
  - { name: scholars_seconds, type: integer, required: true }
  - { name: scholars_map, type: string, required: true }
  - { name: scholars_size, type: string, required: true }
  - { name: scholars_settlements, type: integer, required: true }
defaults: { seed: 1847, keep_seconds: 900, inquiry_seconds: 1800, map: island, size: standard, scholars_seconds: 5400, scholars_map: landmass, scholars_size: l, scholars_settlements: 1 }
pass_when: { min_kept_with_library: 1, max_kept_without_library: 0, min_university_wins: 5, min_needs_university_with: 1, max_needs_university_without: 0, min_read_with_readers: 1, max_read_without_readers: 0, min_reader_skill_ratio: 2, min_universities_unscripted: 1, min_scholars_ideas: 1, max_ideas_without_scholars: 0 }
executor:
  resource: ../references/skills/run-gate.md
  receipt: [gate, params, ticks, scenario_sha256, content_hash, metrics]
attester:
  resource: ../references/attesters/thresholds.ts
---

# Computation

The sanctioned scenario is [learning.ts](/references/scenarios/learning.ts): four paired parts on the standard map, and a new game left to itself.

- **Library.** One settlement is taught the [Courier Depot](/blueprints/depot.md) by a neighbour (scripted) and never builds one. It runs for `keep_seconds` (past `forget_after_seconds`), once with a [Library](/blueprints/library.md) standing and once without.
- **University.** One self-planning settlement with [people](/systems/people.md) on, on each of six internal seeds (the gate's seed first, then 7, 42, 99, 2026, 31337), runs for `inquiry_seconds` without and with a [University](/blueprints/university.md) standing, its scholar found like any worker. `university_wins` counts seeds where the first invention comes sooner with it.
- **Needs a university.** One self-planning settlement with people and [hardship](/systems/hardship.md) on, knowing the [Healer's House](/blueprints/healer.md) (scripted) and kept fresh from sickness (scripted: struck every second), runs for `inquiry_seconds` with a University standing and without one (kept from knowing the University, scripted, so it cannot build its own). `needs_university_with` and `needs_university_without` are 1 when it thought of the [Bathhouse](/blueprints/bathhouse.md), a discovery that needs a university at work.
- **Reading.** Two settlements each with a Library (scripted); the second knows the Courier Depot. With one grown villager of the first schooled to read (scripted) and visits held back, `read_with_readers` is 1 when the first's readers took the Depot off the second's shelves within `copy_every_seconds`; `read_without_readers` the same with nobody schooled. Then one worker schooled to read, with no master of any trade in the settlement (scripted), works a farm for 30 seconds with a Library standing and without: `reader_skill_ratio` is the skill gained with over without.

- **Scholars, unscripted.** A new game with every system on, nothing scripted: `scholars_map` at `scholars_size` with `scholars_settlements` (Landmass L and one settlement, the roomy world of [Gate 17](/gates/17-new-settlements.md)), for `scholars_seconds` (90 minutes, as Gate 17). `universities_unscripted` counts the universities its planners raised; `scholars_ideas` the ideas only a university finds (the Bathhouse, the [Seed Garden](/blueprints/seed_garden.md), the [Printing House](/blueprints/printing_house.md)) that a settlement thought of while its university had a scholar at work, and `ideas_without_scholars` those thought of without one (none should be).

# Proves

Phase 15 of the [roadmap](/roadmap.md), as proposed: with a library a settlement keeps a craft through a long spell without using it that it loses without one, and with a university a discovery comes earlier on at least five of six internal seeds. In the second pass: some discoveries come only with a university, and come in a game left to itself, and villagers schooled to read learn from libraries without a visitor.

# Revisions

- 2026-10-05: the fifth part measured again with universities of planks for villages of 60 with stores to spare: on seeds 1847, 7 and 42 the planner raised 2 universities each within `scholars_seconds` 5400, whose scholars thought of all three ideas; at an hour seed 1847 still misses (5 of 6 seeds hold), so the 90 minutes stay. Nothing changed in the gate.
- 2026-10-05: a fifth part, scholars unscripted (the second pass, with the Seed Garden and the Printing House), with three added checks: `min_universities_unscripted` 1, `min_scholars_ideas` 1 and `max_ideas_without_scholars` 0, on Landmass L with one settlement for `scholars_seconds` 5400. On main at d5d04ae with seeds 1847, 7, 42, 99, 2026 and 31337: a university raised by the planner on each (the first at 2954 to 3994 seconds), and all three ideas only scholars find on each, none without; the other parts as before. An hour was tried first: seed 1847's settlement forgot the University before it was a town and thought of it again only at 3574 seconds.

- 2026-10-05: a fourth part, reading (the second pass), with three added checks: `min_read_with_readers` 1, `max_read_without_readers` 0 and `min_reader_skill_ratio` 2. And the third part's run without a university is now kept from knowing one: on seed 1847, once readers learned trades from its library, the settlement there thought of a university, built it, and with its scholar at work thought of the Bathhouse at 1788 seconds of 1800, as the game should; the check means without a university. On seeds 1847, 7, 42 and 99: read with readers, not without, skill ratio 2.46 to 2.53; the other parts as before.

- 2026-10-04: a third part, a discovery that needs a university (the second pass), with two added checks: `min_needs_university_with` 1 and `max_needs_university_without` 0. On seeds 1847, 7 and 42 the Bathhouse was thought of 18 to 66 seconds in with a university, and never without; the first two parts are unchanged.
