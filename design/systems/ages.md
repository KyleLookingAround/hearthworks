---
type: System
title: Ages
description: Eras group discoveries; a settlement's age is the latest era whose discoveries it mostly knows, and it falls back an age when it forgets them.
tags: [ages, knowledge]
status: stable
generated: { by: claude/opus-5.5, at: 2026-10-05T02:21:49Z }
---

# Eras

Each era is a concept in `design/eras/` with an `order`, its `discoveries` (blueprints that must be thought of) and a `share` of them a settlement must know. Today: [Hand Tools](/eras/hand_tools.md), [Wheel and Keel](/eras/wheel_and_keel.md), [Letters](/eras/letters.md), [Clockwork](/eras/clockwork.md).

# A settlement's age

A settlement's age is the latest era it has reached together with every era before it: knowing at least each era's `share` of its discoveries. Ages turn as discoveries are made, taught and copied ([knowledge](/systems/knowledge.md)), so an age spreads unevenly between settlements. Entering an age, or falling back one, goes into the chronicle; the Steward panel shows each settlement's age.

# What an age unlocks

An era may list blueprints of its own (`unlocks`): a settlement thinks of one only once it has reached that age, though a neighbour that knows it can teach it to anyone. The [Age of Clockwork](/eras/clockwork.md) unlocks the [Windmill](/blueprints/windmill.md). Discoveries already in the game are not locked behind ages: a world that never needs a bridge or a dock would never reach the age that holds them ([log](/log.md), 2026-10-05).

# Falling back

Knowledge not used is forgotten unless a [library](/blueprints/library.md) keeps it, so an isolated or shrinking settlement without a library can fall back an age.

# Not yet

Eras do not yet unlock more than the windmill, and the machine tiers after courier bots (conveyors, rail) and the eras of iron, mills and steam come later.
