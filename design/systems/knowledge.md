---
type: System
title: Knowledge
description: Each settlement's own bundle of blueprints; invented under strain, proven in use, carried by visitors, forgotten when unbuilt.
tags: [knowledge, settlement, okf]
status: stable
generated: { by: claude/opus-5.5, at: 2026-10-04T11:49:05Z }
tuning:
  haul_target: 0.6
  haul_smoothing_seconds: 60
  struggle_severity: 0.3
  encourage_factor: 3
  encourage_threshold: 0.5
  verify_seconds: 30
  forget_after_seconds: 600
  visit_every_seconds: 45
  visit_min_villagers: 8
  copy_every_seconds: 120
  university_factor: 3
  university_threshold: 0.5
  school_factor: 2
  forgetting_memory_seconds: 600
  learning_weight: 0.35
  school_children: 3
  distance_from: 12
  distance_span: 12
  long_haul_from: 30
  reach_smoothing: 50
---

# Idea

"Knowledge is a thing in the world" ([vision](/vision.md)). Every settlement keeps its own small bundle: one record per [blueprint](/blueprints/) it knows. The [planner](/systems/planner.md) only builds from that bundle. The record's fields mirror an OKF concept's frontmatter, as foreseen in [decision 0001](/decisions/0001-okf-design-bundle.md):

| Record field | OKF field | Meaning |
| --- | --- | --- |
| `by`, `at` | `generated` | `founders`, the settlement that thought of it, or `hand` when the player built one first |
| `verified` | `verified` | every settlement that has proven it in use, and when; travels with the record |
| `from` | (provenance) | the settlement a visitor brought it from |
| `used` | `stale_after` counts from here | last time this settlement had one built or being built |

Code: `src/sim/knowledge.ts`, run once a game second.

Porters on [trade](/systems/trade.md) errands gossip as visitors do: they carry what their home has verified, and bring back what the neighbour has.

# Learning

Three buildings keep and grow knowledge (Phase 15):

- A [Library](/blueprints/library.md) keeps what its settlement knows: nothing is forgotten while one stands. With a scribe at work it sends a copy of its records to every neighbour each `copy_every_seconds`. A village thinks of one after it forgets something (the need `forgetting`, full for `forgetting_memory_seconds` after a loss).
- A [School](/blueprints/school.md) with a teacher schools the settlement's children: grown up, they learn trades `school_factor` times as fast ([people](/systems/people.md)).
- A [University](/blueprints/university.md) with a scholar makes invention `university_factor` times as fast, on top of the steward's encouragement, and its scholars take up a line of inquiry at `university_threshold` of the strain anyone else needs: they think ahead of need, where a settlement without one waits until the strain is pressing. It is thought of under `inquiry`: the settlement's strongest strain on the need of a blueprint it does not know.

The planner wants a library while it holds knowledge beyond its founders', a school once there are `school_children` children, and a university in a town that knows of one, each at `learning_weight`.

With [hardship](/systems/hardship.md) on, the needs `fire`, `flood`, `sickness` and `raids` are full for `memory_seconds` after the hazard last struck the settlement, and lead to its counters: the [Well](/blueprints/well.md), [Levee](/blueprints/levee.md), [Healer's House](/blueprints/healer.md), [Watchtower](/blueprints/watchtower.md) and [Palisade](/blueprints/palisade.md).

With planned [roads](/systems/roads.md) on, the need `traffic` of a village or town grows from 0 when its deliveries average `traffic_from` tiles to 1 at `traffic_span` more, and leads to the [Road](/blueprints/road.md).

The need `distance` (with carts on) grows from 0 when a settlement's deliveries average `distance_from` tiles to 1 at `distance_span` more, the average smoothed over about `reach_smoothing` deliveries. The need `long_hauls` ([Ox Barn](/blueprints/ox_barn.md)) grows the same way from `long_haul_from` tiles, over the same span. A blueprint whose `discovery` lists blueprints `after` is thought of only by a settlement that knows them all.

# Founding

Every settlement starts out knowing every blueprint without a `discovery` block. Founding knowledge counts as verified and is never forgotten.

# Invent

A blueprint with `discovery: { need, mean_seconds }` has to be thought of. While a settlement struggles with that need at `struggle_severity` or worse, it comes up with the blueprint at random, on average once per `mean_seconds` of struggle. The draw uses its own seeded stream (`S.krng`), so knowledge never shifts the main simulation's random numbers: scripted Gates 1 to 3 run identically.

Two needs so far. **Crossing**: a settlement whose visitor finds no way to its nearest neighbour (water nobody here can cross) is under full strain, which brings the [dock](/blueprints/dock.md). **Hauling**: the share of a settlement's carriers on deliveries someone asked for (not surplus runs to storage), smoothed over `haul_smoothing_seconds`. Pressure is how far it sits above `haul_target`, scaled to 0 to 1. Without depots this runs at 0.65 to 0.9; depots bring it to about 0.45 to 0.55. The [Courier Depot](/blueprints/depot.md) is discovered this way: machines earn their place by relieving a struggle the player can see.

# Detours

The `detours` need ([Bridge](/blueprints/bridge.md)) is the larger of two pressures, every ten seconds: how much of the grass within reach of the settlement cannot be walked to from its storage yard (past the first fifth, full at three fifths), and how many trips in the last five minutes went the long way round water (`detour_ratio` times the straight line or more, with water on the straight line), full at eight.

# Prove

A finished building that holds an `ok` status for `verify_seconds` proves its blueprint in its settlement: that settlement's name joins `verified`.

# Learn by hand

If the player builds something its settlement does not know, the settlement learns it (`by: hand`) once it is finished. The player can always build anything; knowledge only limits what the village plans for itself.

# Share

Every `visit_every_seconds` a settlement with at least `visit_min_villagers` people and nobody already away sends a visitor to its nearest neighbour: a carrier with empty hands, never its last one, who drops any fetch job and walks over. On large maps a visit takes minutes, and tiny villages that kept sending people starved. The visitor tells the host everything home knows beyond its founding, proven or not, with every verification; the host's news comes back the same way. The learner records `from`, but keeps the original `by`. It still has to prove the practice itself.

Ideas travel unproven on purpose: with only proven knowledge travelling, both villages tended to come up with the depot independently in the minutes the first one spent building and proving it, and nothing spread (see the [log](/log.md)).

# Forget

Discovered knowledge with nothing built from it, no site, and the planner not working towards it, for `forget_after_seconds` is lost. (A village that kept saving up for a depot used to forget it before it could afford one.) Libraries that keep knowledge from being forgotten are [Phase 15](/roadmap.md).

# Settlements

A game can found several settlements ([settlement](/systems/settlement.md)): each has a name, its own storage yard, people, buildings, knowledge and planner. The job board is shared, so carriers can serve a neighbour's site; mood and newcomers are still island-wide.

# Player

The **Knowledge** panel lists, per settlement, what it has learned beyond its founding, how ("thought of here", "learned from Hearth"), whether it has proven it, and what is not yet thought of and why it would be. Visitors on the road are drawn in purple. [Gate 5](/gates/05-knowledge-spreads.md) checks the whole cycle.

# Limits

- One discoverable blueprint (the depot) and one need (hauling). New goods and needs would give invention more to do.
- The island is small: the neighbour sits 13 to 17 tiles away on the swept seeds, and the two settlements share the land: a planner first finds no room for something at 15 to 18 minutes.
- Forgetting is exercised by tests, not by the gates: planned villages keep using what they learn.

A visitor who finds no way home (the way they came has been built over, or the search could not find it) settles with the hosts if they have a free bed, and is otherwise moved home, so nobody is left working for a village they cannot reach.

# Encouragement

The player may encourage one undiscovered blueprint per settlement ([planner](/systems/planner.md), the steward): it is thought of at `encourage_threshold` times the usual `struggle_severity` and `encourage_factor` times as fast. On six seeds, encouraging the Courier Depot brought it sooner on five.
