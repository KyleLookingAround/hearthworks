---
type: Blueprint
title: Printing House
description: Prints the books of its settlement's library for every home, so every grown villager there reads. Only scholars think of it.
tags: [learning, knowledge, people]
status: draft
generated: { by: claude/opus-5.5, at: 2026-10-05T15:16:12Z }
color: "#5a4a6a"
order: 26.5
size: [3, 2]
cost: { planks: 14, cut_stone: 4 }
workers: 1
learning: press
discovery: { need: reading, mean_seconds: 400, after: [library], university: true }
---

# Role

While its printer is at work, every grown villager of its settlement reads, schooled or not: the books are in every home. Readers do what the [School](/blueprints/school.md)'s pupils do once grown ([knowledge](/systems/knowledge.md)): with a [Library](/blueprints/library.md) of its own, the settlement takes in what every other library holds without a visitor, and a worker learns a trade written down there as from a master. It does not school them: only a childhood at school makes a villager learn every trade `school_factor` times as fast ([people](/systems/people.md)).

# Discovery

Thought of under the need `reading` (in a settlement with a library, the share of its grown villagers who cannot read), by a settlement that knows the Library, and only while its [University](/blueprints/university.md) has a scholar at work: books are a scholar's idea. A neighbour may still teach it. The [planner](/systems/planner.md) builds one, at `learning_weight`, in a village or town that knows it and keeps a library.
