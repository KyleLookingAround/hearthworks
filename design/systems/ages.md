---
type: System
title: Ages
description: Eras group discoveries; a settlement enters an age by proving its share of them in use with their works standing, keeps it while it holds that knowledge, and falls back an age when it forgets it.
tags: [ages, knowledge]
status: stable
generated: { by: claude/opus-5.5, at: 2026-10-06T07:42:13Z }
---

# Eras

Each era is a concept in `design/eras/` with an `order`, its `discoveries` (blueprints that must be thought of), the `share` of them a settlement must have proven in use, and how many of their buildings (`works`) must stand when it enters. Today: [Hand Tools](/eras/hand_tools.md), [Wheel and Keel](/eras/wheel_and_keel.md), [Letters](/eras/letters.md), [Clockwork](/eras/clockwork.md).

# A settlement's age

A settlement's age is the latest era it has reached together with every era before it. It **enters** an era once it has proven in use at least the era's `share` of its discoveries (a building of each run well for `verify_seconds` here, [knowledge](/systems/knowledge.md)) and `works` buildings of them stand finished. It **keeps** the age while it still knows what it proved, whether or not the works still stand, and **falls back** when it forgets it. Ideas a settlement merely holds count for nothing, nor what a neighbour proved, nor what its mother proved: a daughter settlement starts in the first age and climbs by its own works. So an age is a milestone the settlement has built, not news it heard ([log](/log.md), 2026-10-06).

Today a settlement enters Wheel and Keel with a bridge, a dock or a cart shed of its own at work; Letters with a library and a university proven (a village or town, since only those plan a university); Clockwork with a courier depot. Entering an age, or falling back one, goes into the chronicle. The Steward panel and the settlement card show each settlement's age, and the **Knowledge** panel says what it still lacks for the next one ("The Age of Letters: prove the University in use").

# What an age unlocks

An era may list blueprints of its own (`unlocks`): a settlement thinks of one only once it has reached that age, though a neighbour that knows it can teach it to anyone. The [Age of Clockwork](/eras/clockwork.md) unlocks the [Windmill](/blueprints/windmill.md) and the [Conveyor](/blueprints/conveyor.md), the machine tier after courier bots ([conveyors](/systems/conveyors.md)). Discoveries already in the game are not locked behind ages: a world that never needs a bridge or a dock would never reach the age that holds them ([log](/log.md), 2026-10-05).

# Falling back

Knowledge not used is forgotten unless a [library](/blueprints/library.md) keeps it, so an isolated or shrinking settlement without a library can fall back an age.

# Not yet

Eras do not yet unlock more than the windmill and the conveyor; rail, the machine tier after belts, and the eras of iron, mills and steam come later.
