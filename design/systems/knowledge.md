---
type: System
title: Knowledge
description: Each settlement's own bundle of blueprints; invented under strain, proven in use, carried by visitors, forgotten when unbuilt.
tags: [knowledge, settlement, okf]
status: stable
generated: { by: claude/opus-5.5, at: 2026-10-05T15:16:12Z }
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
  university_villagers: 60
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

- A [Library](/blueprints/library.md) keeps what its settlement knows: nothing is forgotten while one stands. With a scribe at work it sends a copy of its records to every neighbour each `copy_every_seconds` (the chronicle says a scribe copied it, no longer that a visitor taught it). A village thinks of one after it forgets something (the need `forgetting`, full for `forgetting_memory_seconds` after a loss).
- A [School](/blueprints/school.md) with a teacher schools the settlement's children: grown up, they learn trades `school_factor` times as fast ([people](/systems/people.md)), and they read. A settlement with a library of its own and a grown villager who reads takes in what every other settlement's library holds each `copy_every_seconds`, without a visitor, and whether or not that library has a scribe at work; the chronicle says its readers learned it from those shelves. A worker who reads, in a settlement with a library, learns a trade written down there (any it knows that someone has proven in use) as from a master.
- A [University](/blueprints/university.md) with a scholar makes invention `university_factor` times as fast, on top of the steward's encouragement, and its scholars take up a line of inquiry at `university_threshold` of the strain anyone else needs: they think ahead of need, where a settlement without one waits until the strain is pressing. It is thought of under `inquiry`: the settlement's strongest strain on the need of a blueprint it does not know and could think of itself (ideas only scholars find do not count: the seed garden's need, `bread`, would otherwise bring every settlement the University in its first second).
- A [Printing House](/blueprints/printing_house.md) with a printer makes a reader of every grown villager of its settlement, schooled or not.

The planner wants a library while it holds knowledge beyond its founders', a school once there are `school_children` children, a university in a village of `university_villagers` or more that keeps a library and makes every good it is built of, or in any town, that knows of one, and a printing house in a village or town that keeps a library and knows one, each at `learning_weight`.

# Ideas only scholars find

Some discoveries are marked `university`: a settlement thinks of them only while its own University has a scholar at work. A village of hands alone never comes up with them, whatever its strain; learning opens them. Once thought of, they travel as any knowledge does, by visitors, scribes and readers, so a neighbour without a university may still learn them and build them. Three so far:

- the [Bathhouse](/blueprints/bathhouse.md), under `sickness`, once the Healer's House is known: homes kept clean;
- the [Seed Garden](/blueprints/seed_garden.md), under `bread`: seed bred for the farms, gardens and orchards around it, which bear a quarter more;
- the [Printing House](/blueprints/printing_house.md), under the need `reading` (in a settlement with a library, the share of its grown villagers who cannot read), once the Library is known: books that make readers of the grown.

The game says what waits on a university. The chronicle notes the day a settlement's university first has scholars at work, and names the ideas only they may find; an idea of theirs is told as the scholars' own. The **Knowledge** panel marks each such idea "only scholars think of it", and whether it waits on a university there; the advisor names the idea a settlement's strain calls for and what it lacks to find it (a scholar at work, a university, or the idea of one); the university's inspector lists every such idea with what it waits on: a scholar at work, a blueprint to know first, a later age, the strain, or nothing (its scholars are on it).

With [hardship](/systems/hardship.md) on, the needs `fire`, `flood`, `sickness` and `raids` are full for `memory_seconds` after the hazard last struck the settlement, and lead to its counters: the [Well](/blueprints/well.md), [Levee](/blueprints/levee.md), [Healer's House](/blueprints/healer.md), [Watchtower](/blueprints/watchtower.md) and [Palisade](/blueprints/palisade.md).

With planned [roads](/systems/roads.md) on, the need `traffic` of a village or town grows from 0 when its deliveries average `traffic_from` tiles to 1 at `traffic_span` more, and leads to the [Road](/blueprints/road.md).

The need `distance` (with carts on) grows from 0 when a settlement's deliveries average `distance_from` tiles to 1 at `distance_span` more, the average smoothed over about `reach_smoothing` deliveries. The need `long_hauls` ([Ox Barn](/blueprints/ox_barn.md)) grows the same way from `long_haul_from` tiles, over the same span. The need `boats` ([Shipyard](/blueprints/shipyard.md), with ships on) is 1 while a settlement's people have stayed ashore for want of a free boat within `boatless_memory_seconds` ([the sea](/systems/sea.md)), else 0. The need `conveying` ([Conveyor](/blueprints/conveyor.md)) is `hauling` in a settlement where a Courier Depot stands: its bots are winding about, and its carriers are still run off their feet beyond their reach. A blueprint whose `discovery` lists blueprints `after` is thought of only by a settlement that knows them all, and one marked `university` only while the settlement's [University](/blueprints/university.md) has a scholar at work (see above): some discoveries need scholars at all.

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
