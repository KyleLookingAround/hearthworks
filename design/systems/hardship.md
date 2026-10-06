---
type: System
title: Hardship
description: Fire, flood, sickness and barbarian raids, the counters a settlement finds for each, gifts that bring barbarians in peace, and the steward's laws for hard times.
tags: [hardship, hazards, laws, settlement]
status: draft
generated: { by: claude/opus-5.5, at: 2026-10-06T05:14:43Z }
tuning:
  fire_every_seconds: 40000
  spread_gap: 0.5
  spread_chance: 0.006
  burn_seconds: 30
  douse_seconds: 8
  rebuild_share: 0.5
  fire_loss: 0.5
  fireproof: [bricks, cut_stone]
  flood_chance: 1
  flood_reach: 2
  flood_height: 30
  flood_seconds: 60
  flood_loss: 0.5
  sickness_every_seconds: 60000
  sick_at: 30
  sick_seconds: 90
  sick_spread_gap: 2
  sick_spread_chance: 0.003
  sick_death: 0.1
  healed_seconds: 30
  healed_death: 0.03
  clean_factor: 0.33
  sick_mood: 0.3
  wild_distance: 28
  wild_tiles_per_camp: 3000
  camp_every_seconds: 480
  camp_strength: 3
  camp_grow_seconds: 300
  camp_max: 10
  raid_every_seconds: 600
  raid_reach: 70
  raid_speed: 2
  raid_take: 0.25
  raid_loss: 0.5
  gift_every_seconds: 120
  gift_bread: 2
  gifts_to_settle: 5
  militia_share: 0.2
  surprised_share: 0.3
  memory_seconds: 900
  guard_weight: 0.6
  ration_factor: 1.5
  ration_mood: 0.1
  long_pace: 1.25
  long_mood: 0.1
  short_pace: 0.8
  short_mood: 0.05
  stay_mood: 0.1
  starve_factor: 3
  raid_jitter: 0.5
---

# Idea

Hard times test what a settlement has built. Hardship is on in every new game and off in scenarios that predate it, as seasons and trade were. Every chance it takes comes from its own random stream (`S.hrng`), so turning it on never shifts the rest of the world. Code: `src/sim/hardship.ts`.

Each hazard has a counter, a [blueprint](/blueprints/) nobody knows at the founding: a settlement thinks of it while the hazard is fresh in its memory (struck within `memory_seconds`, the needs `fire`, `flood`, `sickness` and `raids` in [knowledge](/systems/knowledge.md)). Its [planner](/systems/planner.md) then sites counters where they guard the most of what the hazard threatens that nothing guards yet (what burns, low land by the water, homes with people in them, and against raiders the first storage yard they make for) (`guard_weight` times the unguarded share), once everyone is fed: like comforts, counters wait while bread is short. A counter with a worker (the healer, the lookout) guards only while its worker is at their post.

# Fire

Anything built without a `fireproof` good (bricks, cut stone) catches fire about once every `fire_every_seconds` per building. A fire burns `burn_seconds`, and each second may jump (`spread_chance`) to any building that burns within `spread_gap` tiles: wooden rows built wall to wall are most at risk. When it burns out, `fire_loss` of what was inside is gone. A storage yard (open piles) stands; anything else stands gutted: a construction site again, needing `rebuild_share` of its cost, built before anything else (the last maker of a good its own cost needs, such as a settlement's only sawmill, needs none of that good: what its makers save of it rebuilds it, or nothing could). Its people stay on in the shell; its worker goes carrying.

The [Well](/blueprints/well.md) and a fire crew mustered from the neighbours answer it: a fire within its reach is put out in `douse_seconds` and spreads no further, and the building is saved.

# Flood

At the turn of each year (the thaw, with seasons on) the waters rise with chance `flood_chance`: every building with a tile no higher than `flood_height` within `flood_reach` of water stands flooded for `flood_seconds`, makes nothing meanwhile, and loses `flood_loss` of what it holds. A [Levee](/blueprints/levee.md) keeps the water off everything within its reach.

# Sickness

A settlement of `sick_at` people or more falls sick about once every `sickness_every_seconds` per villager: one home first, then any home within `sick_spread_gap` with chance `sick_spread_chance` a second. A home is sick for `sick_seconds`, its workers in bed, and when it passes each of its people dies with chance `sick_death`. The sick weigh on mood (`sick_mood` times their share). A [Healer](/blueprints/healer.md) at work shortens it to `healed_seconds`, stops it spreading, and only `healed_death` die. Sanitation: a [Bathhouse](/blueprints/bathhouse.md) with its attendant in keeps the homes within its radius clean, so an outbreak that would start in one passes it by with chance `1 - clean_factor`, and a sick neighbour spreads to it `clean_factor` as often; healers and bathhouses work together. Only a settlement with a university at work thinks of the bathhouse. Its planner builds one, once struck by sickness and everyone is fed, where it keeps the most homes clean that nothing keeps clean yet.

# Barbarians

Kyle's idea. Wild land is open ground farther than `wild_distance` from every building of every settlement. Every `camp_every_seconds` the wilds are looked over: a barbarian camp is pitched on wild land while there are fewer camps than one per `wild_tiles_per_camp` tiles of it, so more where more land lies untouched. Camps gather on the edge of the wilds, within `raid_reach` of a settlement's stores, while there is any such land. A camp starts at `camp_strength` raiders and gains one every `camp_grow_seconds`, up to `camp_max`.

About every `raid_every_seconds` (a new camp's first raid within `raid_jitter` of it either way, later ones within half that) a camp sends its raiders on foot to the nearest settlement's first storage yard within `raid_reach`. There they meet its defence: the watchtowers and palisades guarding that yard, and a militia of `militia_share` of its grown villagers, all of them if a lookout on a watchtower saw the raiders coming, `surprised_share` of them otherwise. A defence at least as strong beats them off, and the camp loses `raid_loss` of the raiders it sent (a camp left with none breaks up); a weaker one loses `raid_take` of every good in its stores.

The answers are the [Watchtower](/blueprints/watchtower.md), the [Palisade](/blueprints/palisade.md), the militia, and in the end [settling](/systems/settling.md): a camp the settlements grow up to breaks up, and as civilisation spreads the wild land where camps can appear shrinks.

With [trade](/systems/trade.md) on there is a gentler answer. Every `gift_every_seconds` a camp not out raiding is sent bread by the nearest settlement whose people can walk to it (within `raid_reach`), `gift_bread` loaves for each of its raiders, if its stores can spare that much as trade judges spare (the food chain keeps twice the cover and a meal a villager). The first settlement to send bread keeps sending it. A camp never raids a settlement that has sent it bread, though it may still raid others, and its pennant turns white. After `gifts_to_settle` gifts its people come in peace and settle there, as many as it has free beds for (newcomers like any other, named by its custom), the rest going their own way, and the camp is gone. Both go into the chronicle, and the Steward panel lists the camps a settlement sends bread to.

# Laws

The steward's laws for each settlement, in the Steward panel (daughters take their mother's):

- **Rationing.** Everyone eats `ration_factor` times less often, at `ration_mood` off mood: stores last longer through a lean winter.
- **Working hours.** Long hours make workplaces `long_pace` times as fast at `long_mood` off mood; short hours `short_pace` as fast and `short_mood` on.
- **Who may leave.** With leaving forbidden, nobody leaves for hunger and mood loses `stay_mood`; a home hungry `starve_factor` times as long as it takes someone to leave loses one of its people to starvation instead.

# Kyle's call

Fire guts buildings rather than destroying them for good. How often each hazard strikes, and whether raids should cost lives as well as goods.
