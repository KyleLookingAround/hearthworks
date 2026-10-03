---
type: System
title: Trade
description: Neighbouring settlements send porters to swap what they can spare for what they want, one load at a time, and count steady imports as relief.
tags: [trade, settlement, economy]
status: stable
generated: { by: claude/opus-5.5, at: 2026-10-03T18:22:59Z }
tuning:
  every_seconds: 15
  load: 4
  keep: 8
  min_villagers: 8
  smoothing_seconds: 300
  distance_weight: 0.005
  min_rate: 0.5
  max_rate: 2
  villagers_per_porter: 25
  export_demand: 0.2
  want_cover: 30
  spare_cover: 60
---

# Idea

Two villages finding their own ways and swapping what they have. Trade is on in every new game and off in scenarios that predate it, as seasons are. Code: `src/sim/trade.ts`.

# Surplus and want

A settlement weighs each good by its **cover**: how many seconds its stock lasts at the rate it uses the good (its [planner](/systems/planner.md)'s demand at its last look).

- **Want.** A good it uses with less than `want_cover` seconds in store, the more the less it has; or one its planner is short of (a shortage's severity, at least `min_severity`) or saving for.
- **Spare.** Stock beyond `keep` plus `spare_cover` seconds of its own use, of a good it does not want and has not lately traded for, less what carriers have claimed. Of what its homes eat it also keeps a meal per villager.

# Porters

Every `every_seconds` a settlement of at least `min_villagers`, with fewer porters out than one for every `villagers_per_porter` (at least one), looks for the best deal: a want of its own that a neighbour can spare, for a spare good of its own that neighbour wants, scored by both wants less `distance_weight` per tile between storage yards. A carrier takes up to `load` of the spare good from the stores and walks to the neighbour's yard like a [visitor](/systems/knowledge.md), gossiping as they do.

# Barter

At the neighbour the load goes into its stores, and the porter takes back the wanted good: the load times the rate, as much as the neighbour can spare. The rate is how badly the neighbour wants what it got over how badly the porter's home wants what it gets, between `min_rate` and `max_rate`. There is no money; a load goes one way only when a load comes back, or nothing does if the neighbour has run out.

# Making for neighbours

A settlement's planner counts what its neighbours want and make none of as demand of its own, `export_demand` a second for each unit of their want's severity, for goods it knows how to make. Staples both make (bread, planks) stay each settlement's own business. A village by the clay sees its neighbour short of bricks and builds a kiln for both.

# Imports as relief

Each delivery adds to the settlement's smoothed imports (a rate per second fading over `smoothing_seconds`). The planner counts imports as supply, so a settlement trading steadily for bricks or bread stops planning the workplaces it would otherwise need, and specialises in what it trades away.

# Ledger

Each settlement keeps what it made, exported and imported of every good. The first trade between two settlements goes into the chronicle.

# Kyle's call

Should money exist at all, or stay barter? Today it is barter.
