---
type: Attested Computation
title: "Gate 15: learning"
description: A library keeps a craft its settlement would otherwise forget, a university brings a discovery sooner on at least five of six seeds, some discoveries come only with a university, and readers learn from libraries without a visitor.
tags: [gate, roadmap, learning, knowledge]
status: stable
generated: { by: claude/opus-5.5, at: 2026-10-05T00:41:01Z }
runtime: hearthworks-sim
computation: ../references/scenarios/learning.ts
parameters:
  - { name: seed, type: integer, required: true }
  - { name: keep_seconds, type: integer, required: true }
  - { name: inquiry_seconds, type: integer, required: true }
  - { name: map, type: string, required: true }
  - { name: size, type: string, required: true }
defaults: { seed: 1847, keep_seconds: 900, inquiry_seconds: 1800, map: island, size: standard }
pass_when: { min_kept_with_library: 1, max_kept_without_library: 0, min_university_wins: 5, min_needs_university_with: 1, max_needs_university_without: 0, min_read_with_readers: 1, max_read_without_readers: 0, min_reader_skill_ratio: 2 }
executor:
  resource: ../references/skills/run-gate.md
  receipt: [gate, params, ticks, scenario_sha256, content_hash, metrics]
attester:
  resource: ../references/attesters/thresholds.ts
---

# Computation

The sanctioned scenario is [learning.ts](/references/scenarios/learning.ts): four paired parts on the standard map.

- **Library.** One settlement is taught the [Courier Depot](/blueprints/depot.md) by a neighbour (scripted) and never builds one. It runs for `keep_seconds` (past `forget_after_seconds`), once with a [Library](/blueprints/library.md) standing and once without.
- **University.** One self-planning settlement with [people](/systems/people.md) on, on each of six internal seeds (the gate's seed first, then 7, 42, 99, 2026, 31337), runs for `inquiry_seconds` without and with a [University](/blueprints/university.md) standing, its scholar found like any worker. `university_wins` counts seeds where the first invention comes sooner with it.
- **Needs a university.** One self-planning settlement with people and [hardship](/systems/hardship.md) on, knowing the [Healer's House](/blueprints/healer.md) (scripted) and kept fresh from sickness (scripted: struck every second), runs for `inquiry_seconds` with a University standing and without one (kept from knowing the University, scripted, so it cannot build its own). `needs_university_with` and `needs_university_without` are 1 when it thought of the [Bathhouse](/blueprints/bathhouse.md), a discovery that needs a university at work.
- **Reading.** Two settlements each with a Library (scripted); the second knows the Courier Depot. With one grown villager of the first schooled to read (scripted) and visits held back, `read_with_readers` is 1 when the first's readers took the Depot off the second's shelves within `copy_every_seconds`; `read_without_readers` the same with nobody schooled. Then one worker schooled to read, with no master of any trade in the settlement (scripted), works a farm for 30 seconds with a Library standing and without: `reader_skill_ratio` is the skill gained with over without.

# Proves

Phase 15 of the [roadmap](/roadmap.md), as proposed: with a library a settlement keeps a craft through a long spell without using it that it loses without one, and with a university a discovery comes earlier on at least five of six internal seeds. In the second pass: some discoveries come only with a university, and villagers schooled to read learn from libraries without a visitor.

# Revisions

- 2026-10-05: a fourth part, reading (the second pass), with three added checks: `min_read_with_readers` 1, `max_read_without_readers` 0 and `min_reader_skill_ratio` 2. And the third part's run without a university is now kept from knowing one: on seed 1847, once readers learned trades from its library, the settlement there thought of a university, built it, and with its scholar at work thought of the Bathhouse at 1788 seconds of 1800, as the game should; the check means without a university. On seeds 1847, 7, 42 and 99: read with readers, not without, skill ratio 2.46 to 2.53; the other parts as before.

- 2026-10-04: a third part, a discovery that needs a university (the second pass), with two added checks: `min_needs_university_with` 1 and `max_needs_university_without` 0. On seeds 1847, 7 and 42 the Bathhouse was thought of 18 to 66 seconds in with a university, and never without; the first two parts are unchanged.
