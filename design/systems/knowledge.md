---
type: System
title: Knowledge
description: Each settlement's own bundle of blueprints; invented under strain, proven in use, carried by visitors, forgotten when unbuilt.
tags: [knowledge, settlement, okf]
status: stable
generated: { by: claude/opus-5.5, at: 2026-10-03T12:27:37Z }
tuning:
  haul_target: 0.6
  haul_smoothing_seconds: 60
  struggle_severity: 0.3
  verify_seconds: 30
  forget_after_seconds: 600
  visit_every_seconds: 45
  visit_min_villagers: 8
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

# Founding

Every settlement starts out knowing every blueprint without a `discovery` block. Founding knowledge counts as verified and is never forgotten.

# Invent

A blueprint with `discovery: { need, mean_seconds }` has to be thought of. While a settlement struggles with that need at `struggle_severity` or worse, it comes up with the blueprint at random, on average once per `mean_seconds` of struggle. The draw uses its own seeded stream (`S.krng`), so knowledge never shifts the main simulation's random numbers: scripted Gates 1 to 3 run identically.

Two needs so far. **Crossing**: a settlement whose visitor finds no way to its nearest neighbour (water nobody here can cross) is under full strain, which brings the [dock](/blueprints/dock.md). **Hauling**: the share of a settlement's carriers on deliveries someone asked for (not surplus runs to storage), smoothed over `haul_smoothing_seconds`. Pressure is how far it sits above `haul_target`, scaled to 0 to 1. Without depots this runs at 0.65 to 0.9; depots bring it to about 0.45 to 0.55. The [Courier Depot](/blueprints/depot.md) is discovered this way: machines earn their place by relieving a struggle the player can see.

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
