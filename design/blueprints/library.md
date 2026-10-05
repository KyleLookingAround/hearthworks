---
type: Blueprint
title: Library
description: Holds the settlement's knowledge in the world, so nothing on its shelves is forgotten; its scribe copies records for the neighbours.
tags: [learning, knowledge]
status: stable
generated: { by: claude/opus-5.5, at: 2026-10-05T00:41:01Z }
color: "#6a5a8a"
order: 24
size: [3, 2]
cost: { planks: 10 }
workers: 1
learning: library
discovery: { need: forgetting, mean_seconds: 120 }
---

# Role

While a library stands, its settlement forgets nothing it knows ([knowledge](/systems/knowledge.md)). With a scribe at work it sends a copy of every record beyond founding knowledge to each neighbour every `copy_every_seconds`, as a visitor would. Its shelves are the settlement's knowledge bundle, browsable in its inspector. Villagers schooled to read ([School](/blueprints/school.md)) read from it: their settlement takes in what every other library holds, without a visitor, and a reader at work learns a trade written down here as from a master.

# Discovery

A village thinks of the library after it forgets something: the need `forgetting` is full for `forgetting_memory_seconds` after a loss.
