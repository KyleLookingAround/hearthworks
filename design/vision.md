---
type: Vision
title: Vision
description: A 2D web town builder where villagers decide what to build, and a hamlet grows into a civilisation on its own.
tags: [vision]
status: draft
generated: { by: claude/opus-5.5, at: 2026-10-03T08:55:28Z }
sources:
  - id: kyle-2026-10-03
    resource: conversation with Kyle on 2026-10-03
    title: Direction set by Kyle
    author: human:kyle
  - id: havencraft
    resource: https://store.steampowered.com/app/2481240/HavenCraft/
    title: HavenCraft on Steam
    author: team:dionic-software
  - id: okf
    resource: https://github.com/GoogleCloudPlatform/open-knowledge-format
    title: Open Knowledge Format
---

# Pitch

A cosy top-down town builder in the browser where the villagers build what they need, and a handful of settlers grow into a large civilisation.[^kyle-2026-10-03] Every good is physically carried, first by people, then by machines they invent.

# Pillars

- **The village plans.** Villagers notice shortages and choose what to build and where ([planner](/systems/planner.md)). The player steers rather than places.
- **Every item moves.** No global stockpile; the [job board](/systems/logistics.md) is the heart of the game.
- **Machines earn their place.** Each automation tier removes a chore people were visibly struggling with ([Courier Depot](/blueprints/depot.md) is the first).
- **Knowledge is a thing in the world.** What a village knows how to build is an OKF-style bundle: invented by someone, verified by use, spread between settlements, forgotten when unused.[^okf]
- **Web-first.** Runs in a browser tab on phone and desktop, deploys to GitHub Pages.

# What we borrow from HavenCraft

A functional economy where the carpenter waits on the forester and the forester must replant; work orders that belong to the building; small logistics robots; villagers who leave when poorly looked after.[^havencraft] What changes: 2D instead of third person, and the villagers make the building decisions.

# Today

The village plans: the [planner](/systems/planner.md) grows a hamlet of five into a town of about ninety in half an hour of game time, and the player can switch it off to place buildings by hand. What it does not do yet is the knowledge pillar: every village starts out knowing every blueprint (see the [roadmap](/roadmap.md)).

[^kyle-2026-10-03]: Direction set by Kyle
[^havencraft]: HavenCraft on Steam
[^okf]: Open Knowledge Format
