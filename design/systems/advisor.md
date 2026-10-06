---
type: System
title: Advisor
description: Each settlement's advisor ranks what the player could do about it, gives only advice a lever, a law, an idea to encourage, a zone or a building can answer, and does not repeat itself while nothing has changed.
tags: [steward, advisor, levers]
status: stable
generated: { by: claude/opus-5.5, at: 2026-10-06T07:25:25Z }
tuning:
  every_seconds: 10
  tips: 3
  hold_seconds: 180
  quiet_seconds: 900
  zone_room_tiles: 40
  weights:
    hungry: 10
    raiders: 8
    winter_store: 7
    hungry_stay: 6
    answer: 5
    oxen: 4
    scholars: 3
    room: 3
    packed: 3
    cart_shed: 2
    ox_barn: 2
    long_hauls: 2
    diet: 1
    noise: 1
---

# Idea

The steward steers each settlement with levers and laws ([steward](/systems/planner.md)). The advisor says which one to reach for now, and offers it: a tip that a lever or a law answers carries it, and the Steward panel sets it with one tap (`takeAdvice` in `src/sim/commands.ts`). Code: `adviceFor` and `updateAdvice` in `src/sim/steward.ts`, run once a game second after the world's other systems; it reads the state and writes only each settlement's own tips (`advice`, `advised`).

# What it advises

Every `every_seconds` it gathers each tip that holds for a settlement and ranks them by the kind's weight (`weights`) times one plus how pressing it is (0 to 1):

| Kind | When | It offers |
| --- | --- | --- |
| `hungry` | fed below `advise_hungry_below` ([needs](/systems/needs.md)) | bread one priority up; with bread first already, rationing |
| `raiders` | camps in reach outnumber its defence ([hardship](/systems/hardship.md)) | defence one priority up |
| `winter_store` | summer or autumn, the winter store behind ([seasons](/systems/seasons.md)) | rationing |
| `hungry_stay` | the hungry may not leave, and some go hungry | letting them leave |
| `answer` | its planner finds nothing it knows would help | encouraging the idea that would, if it could think of it now; for an idea only scholars find, the way to a university |
| `scholars` | strain an idea only scholars find would answer, no university at work | the way to a university |
| `room` | its planner has no room, and there is land to zone | (paint a zone) |
| `oxen`, `cart_shed`, `ox_barn`, `long_hauls` | long hauls and the oxen's feed ([logistics](/systems/logistics.md)) | bread or hauling one priority up, or the idea to encourage |
| `packed` | homes packed in its centres with nothing to fight a fire | guarding against fire one priority up |
| `diet` | bread alone, with farms that grow ([farms](/systems/farms.md)) | (place a garden, orchard or pasture it knows) |
| `noise` | its homes within a sawmill's noise | (zone them apart) |

It never advises what the player cannot act on:

- an idea that waits on a later age, on what must be known first, or on a neighbour;
- a university for a hamlet, or one already standing that waits for a scholar (the way to a university is encouraging one it could think of now, or placing one it knows, in a village or a town);
- a priority already first;
- zoning on a full island: a zone helps only where there is no-build land of its own to lift, or `zone_room_tiles` of open, walkable land of its own beyond where its planner looks now but within its `search_radius_max` ([planner](/systems/planner.md));
- what was pulled down, or the latest page of history (the chronicle shows those).

# Not repeating itself

It keeps its `tips` best. A tip given stays while it holds, up to `hold_seconds`. Once given, a kind is not given again for `quiet_seconds` unless its grounds changed: the player raised the priority it asked for (it may then offer the next level), another building has no room, another idea would answer. Progress towards ideas, and what waits on an age or a scholar, are shown in the **Knowledge** panel and on the settlement card ([knowledge](/systems/knowledge.md)).
