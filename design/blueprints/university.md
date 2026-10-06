---
type: Blueprint
title: University
description: Scholars pursue lines of inquiry, in a hall of planks a village can raise, so a settlement comes up with new ideas faster under strain, and with ideas no village of hands alone finds.
tags: [learning, knowledge]
status: stable
generated: { by: claude/opus-5.5, at: 2026-10-06T08:14:04Z }
color: "#4a5a7a"
order: 26
size: [3, 3]
cost: { planks: 28 }
workers: 1
learning: university
discovery: { need: inquiry, mean_seconds: 300 }
---

# Role

Built of planks alone, three by three, so a village of 60 can raise one from what it makes; roads go round it, and with no room the planner clears a workshop resting with enough in store for it ([planner](/systems/planner.md)).

With a scholar at work, its settlement invents `university_factor` times as fast under strain ([knowledge](/systems/knowledge.md)), on top of any encouragement from the steward. And its scholars find ideas a village of hands alone never reaches: the [Seed Garden](/blueprints/seed_garden.md), the [Printing House](/blueprints/printing_house.md) and the [Bathhouse](/blueprints/bathhouse.md) are thought of only while a university has a scholar at work. The chronicle notes the day its first scholars take up their inquiries, and its inspector lists each such idea with what it waits on.

# Discovery

The need `inquiry` is how hard the settlement strains on the needs of blueprints it has not yet thought of and could think of without scholars, and, once it keeps a library, on the needs of ideas only scholars find ([knowledge](/systems/knowledge.md)). A village of `university_villagers` that keeps a library, once everyone is fed, its winter store is on track and its stores hold `university_spare` times its cost, or any town, plans one once it knows how: learning builds on learning ([planner](/systems/planner.md)).
