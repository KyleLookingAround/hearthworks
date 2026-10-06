---
type: System
title: People
description: Villagers as individuals; names, ages, births and deaths, skills that grow with practice and pass from master to apprentice, each village's custom for its dead, its naming custom, and its feasts through the year.
tags: [people, customs, settlement]
status: stable
generated: { by: claude/opus-5.5, at: 2026-10-05T16:33:40Z }
tuning:
  adult_seconds: 600
  elder_seconds: 6000
  lifespan_seconds: 7200
  lifespan_jitter_seconds: 3600
  founder_age_max_seconds: 1500
  birth_every_seconds: 600
  practice_seconds: 300
  apprentice_factor: 3
  expert_at: 0.8
  skill_speedup: 0.5
  rite_grace_seconds: 120
  rite_penalty: 0.15
  change_custom_after_seconds: 400
  pyre_logs: 4
  ship_planks: 6
  custom_radius: 12
  wood_for_pyre: 0.45
  water_for_ship: 0.1
  feast_seconds: 240
  feast_mood: 0.1
  harvest_bread: 0.5
  fire_logs: 0.25
  wood_for_fire: 0.45
  feast_spread: 0.1
  feast_lay_in: 1.2
  feast_retry_seconds: 10
  apart: 0.4
  craft_pace: 0.1
  craft_look_seconds: 10
  names_sea: [Marin, Coral, Gull, Tide, Cove, Pearl, Wave, Kelp, Skerry, Shell, Tern, Brine, Selkie, Harbour, Sandy, Oyster]
  names_trees: [Ash, Rowan, Hazel, Alder, Birch, Holly, Elm, Willow, Linden, Hawthorn, Oak, Yew, Aspen, Juniper, Laurel, Briar]
  names_fields: [Barley, Clover, Meadow, Heath, Wren, Lark, Poppy, Sorrel, Thyme, Bramble, Fern, Teasel, Linnet, Daisy, Sedge, Robin]
---

# Idea

Villagers are people, not counters. People are on in every new game and off in scenarios that predate them, as the planner was; their randomness has its own stream, so nothing else in the world shifts. Code: `src/sim/people.ts`.

# Ages

Each villager is born at a moment of game time. A child (younger than `adult_seconds`) lives at home and eats but neither works nor carries; an elder (from `elder_seconds`) has retired from their workplace and only carries. Each villager's life runs `lifespan_seconds` plus up to `lifespan_jitter_seconds`, and then they die, gently and of old age only. A founding village's people are adults of ages up to `founder_age_max_seconds`; newcomers are young adults.

# Births

A home with two adults in it, fed (no hunger, food on the shelf), has a child on average once every `birth_every_seconds` while its settlement has a free bed (the child's own home first), everyone in it is fed, and its planner is not badly short (a severity of 0.5 or more) of anything in the food chain (bread, wheat) nor short of food as newcomers judge it ([needs](/systems/needs.md)): a village has children when it can feed them. Newcomers still come where they do; a settlement can also grow by births alone.

# Skills

Each villager has a skill for each kind of workplace, from 0 to 1. Working one raises it towards 1 with time constant `practice_seconds`, `apprentice_factor` times as fast while an expert (skill `expert_at` or more) of that trade lives in the settlement: master to apprentice. Work goes to the most skilled villager free. A workplace runs at `1 - skill_speedup / 2 + skill_speedup * skill` of its pace, so a novice at three quarters and an expert at five quarters. A trade whose only expert dies is one death from being lost.

# School

A child who grows up while their settlement's [School](/blueprints/school.md) has a teacher at work is schooled, and learns every trade `school_factor` times as fast ([knowledge](/systems/knowledge.md)). A schooled villager reads: with a [Library](/blueprints/library.md) in their settlement, they learn a trade it knows that someone has proven in use as though a master lived there, so a trade whose last master dies is not lost where there is a library and someone to read it. A grown villager also reads, schooled or not, while their settlement's [Printing House](/blueprints/printing_house.md) has its printer at work; only schooling makes them learn faster.

# Honouring the dead

Every settlement keeps a custom for its dead:

- **Burial** in a [Graveyard](/blueprints/graveyard.md), which takes land, fills with the years and is never built over.
- **Cremation** on a [Pyre](/blueprints/pyre.md), which burns `pyre_logs` logs for each farewell, so a timber-poor village feels it.
- **Ship burial** from a [Dock](/blueprints/dock.md), a boat of `ship_planks` planks set out to sea: only by water.

A new settlement takes up its custom from its land: within `custom_radius` of its storage yard, a share of water of at least `water_for_ship` makes it a people of the sea, else a share of its land in grown trees of at least `wood_for_pyre` makes it cremate, and otherwise it buries; unless a settlement founded before it already keeps that custom, when it sets itself apart ([traditions](#traditions)). Each death waits for its farewell; the planner builds the custom's place when it needs one. A death not honoured within `rite_grace_seconds` costs the settlement's mood up to `rite_penalty` until it is. A settlement whose dead have waited `change_custom_after_seconds` with no place for its custom at all, not even one being built (no room for a graveyard, no dock it knows how to build) takes up another, and its neighbours notice: both go into the chronicle.

# Feasts

With seasons on as well (every new game), each settlement keeps feasts through the year, each a practice with a cost and a lift:

- **Harvest Festival**, in autumn: the stores give `harvest_bread` loaves for each villager.
- **Midwinter Fire**, in winter: the stores give `fire_logs` logs for each villager to a bonfire.

A settlement starts out keeping the feast its land suggests: one whose land within `custom_radius` is at least `wood_for_fire` grown trees lights the fire, others hold the festival; unless a settlement founded before it already keeps that feast, when it sets itself apart as it does for its dead ([traditions](#traditions)). A feast held lifts the settlement's mood by `feast_mood` for `feast_seconds`, on top of everything else and against the winter's cold; a feast is held as its season comes if the stores allow, and otherwise put off, looked at again every `feast_retry_seconds` and held as soon as they do; one not held by the season's end is missed, and the chronicle says so. A settlement lays in for its feasts: in the season before each, and in its own until it is held, its stock of the feast's good (what workplaces rest at and the planner plans for) counts `feast_lay_in` times what the feast needs on top. Held only at the season's first moment, a harvest festival found the yards bare: with bread baked for the days ahead, a hamlet's yards hold a few loaves and its homes the rest. A visitor home from a neighbour that keeps a feast their own settlement does not brings it home with a chance of `feast_spread`, so over the years each settlement's mix of feasts comes from its land and its neighbours. Daughter settlements keep their mother's feasts. Code: `holdFeasts` and `bringFeast` in `src/sim/people.ts`.

# Names

Every villager has a given name, taken from their settlement's naming custom. A settlement takes its naming custom with its custom for the dead, as it is founded: a people who set their dead out to sea name their children for the sea (`names_sea`), one of the pyre for the trees (`names_trees`), and one that buries for the fields and their birds (`names_fields`). (Until traditions came, both were read from the land by the same lines, so they always went together; now a settlement set apart from its neighbour names its children by the custom it took up.) Founders and newcomers go by a name of the settlement they live in or come to; a daughter settlement keeps its mother's custom, and those who settle it keep their names. The name is picked by the villager and the world's seed, not drawn from any random stream, so names change nothing else in the world. Names show in a home's household, and in the news of births and deaths; the first child of a settlement goes into the chronicle by name. The custom does not change or spread: it keeps neighbouring villages apart, where feasts converge. A save from before names (version 24) gives each settlement the naming custom of its custom for the dead and its people their names when it loads. Code: `namingFor` and `nameFor` in `src/sim/people.ts`.

# Traditions

Each settlement holds to ways of its own, which set it apart from its neighbours even where their land is alike, and which it passes to its daughters.

**Set apart at its founding.** Settlements are founded in turn. Each looks at what its land suggests for its dead and its feast, as above; if a settlement founded before it already keeps that, it takes up instead the one its land allows best that none of them keeps, so long as its land comes within `apart` of suggesting it outright: for the pyre a share of grown trees of at least `wood_for_pyre` times `1 - apart`, for the sea a share of water of at least `water_for_ship` times `1 - apart` and the dock already known (a custom taken up to stand apart must be one it can keep), for the midwinter fire `wood_for_fire` times `1 - apart`; burial and the harvest festival suit any land. Land that allows nothing else keeps what it suggests. So of two villages on land half wooded, the first buries and holds the harvest festival and the second, its land wooded enough, cremates and lights the midwinter fire; on bare land both bury. It names its children by the custom it takes up. Each costs what it costs (a graveyard's land, a pyre's logs, a boat's planks, bread or logs for the feast), so the second village of a pair lives with a different trade-off from the first. Code: `takeCustom` and `takeFeast` in `src/sim/people.ts`.

**A craft.** A settlement takes pride in a trade: it takes up as its craft the trade of its most skilled master (`expert_at`) among the trades no other settlement works (has a workplace of standing) or holds as its craft, looking every `craft_look_seconds`. Only workplaces that make goods are crafts (not schools, libraries, halls, rites or fields being laid). Its workplaces of that kind work `craft_pace` faster from then on, on top of their workers' skill. As settlements on one island trade for what a neighbour makes rather than build their own maker ([trade](/systems/trade.md)), a village's craft is what it is known for: a fishing village's fish, a quarry village's stone, a mining village's ore. Without people there are no crafts. Code: `seekCrafts` and `takeCraft` in `src/sim/people.ts`.

**Kept and passed on.** A daughter settlement keeps its mother's custom, feasts, names and craft, and says so in its chronicle; a custom gives way only under strain, as above, and feasts still spread by visitors. A custom giving way stays apart where it can: a burying settlement takes to the pyre and a cremating one to burial as before, and a people of the sea with no dock takes to the pyre where another settlement buries and none cremates, and otherwise buries. Code: `giveWay`. The chronicle, the [Steward](/systems/steward.md) panel (each way with why it is held: its land, the neighbour it set itself apart from, its mother, its first master) and the inspector of a workplace of its craft say what a settlement holds to and why. A save from before traditions (version 30) keeps its settlements' customs, feasts and names; each takes up a craft from its next look.

# Not yet

The planner is a villager too: a [Town Hall](/blueprints/town_hall.md)'s planner learns the trade like any other and, at their desk, lets the settlement build more at once ([planner](/systems/planner.md)). District halls, a planner for each district, were tried and gave nothing more ([log](/log.md), 2026-10-05).

# Kyle's call

The tone of death and ageing in a cosy game (old age only, shown gently in the chronicle), and which customs fit the game's feel.
