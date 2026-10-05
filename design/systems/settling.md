---
type: System
title: Settling
description: A crowded settlement, or one whose land is full, sends a founding party off to found a daughter town, with villagers, stores, the knowledge it practises and its custom.
tags: [settlement, people, knowledge]
status: stable
generated: { by: claude/opus-5.5, at: 2026-10-05T04:31:02Z }
tuning:
  check_every_seconds: 60
  min_villagers: 70
  crowded_min_villagers: 30
  cooldown_seconds: 1200
  party_size: 6
  max_settlements: 8
  stores_share: 0.25
---

# Idea

Settlements beget settlements. Settling is on in every new game and off in scenarios that predate it. Code: `src/sim/settle.ts`.

# When

Every `check_every_seconds` a self-planning settlement with at least `min_villagers` people (or `crowded_min_villagers` while its planner finds no room for what it needs: its land is full), and none sent from it in the last `cooldown_seconds`, sends a founding party if it can pay for the new storage yard and two cottages, and the starting stores a new game begins with (`storage` in [settlement](/systems/settlement.md)), from its own stores, while the world has fewer than `max_settlements` settlements. Nobody sets out from a settlement that goes hungry; with [seasons](/systems/seasons.md) on, parties travel in spring and summer only, as newcomers do, and only while the winter store keeps pace (a party takes its share of it: a town that sent two in a late summer starved through the winter after).

A settlement that has filled its land is crowded long before it is large: on the Islands at size M, two villages of 50 to 60 filled their islands within twenty minutes and stood still for the rest of the hour, never reaching `min_villagers` to send anyone ([log](/log.md), 2026-10-05). Settling for want of land lets them spill over the water instead.

# Where

The party looks for a site as the world's first neighbours were placed ([settlement](/systems/settlement.md)): the whole starting layout on open grass, at least `neighbour_min_distance` from every settlement, with room to grow, scored for room and wood, reachable on foot from its mother unless the map allows neighbours across water. With charts on (every new game), only on islands its mother has charted ([the sea](/systems/sea.md)): a settlement with nowhere charted to go, but islands it has not charted, comes up with the dock and sends an explorer out first. A daughter keeps her mother's charts.

# Across the water

The party must be able to reach its site: on foot, or rowing from a [dock](/blueprints/dock.md). What it can walk to is found once a look; without a dock, sites beyond it are never searched for (a route search that fails covers the whole map). A settlement with no such site left but land across the water feels the need to cross it, so it comes up with the dock and builds one (clearing a workshop from its shore if it has built along every shore: [planner](/systems/planner.md)), and its next party sails: the daughter is a colony (`overseas`), and the chronicle says so. A settler whose row is cut short rows on from the water; before, two stranded settlers could close a new colony's yard to everyone (see [logistics](/systems/logistics.md), no way in).

# Who and what

- **People.** `party_size` villagers who are not working (carriers first; with [people](/systems/people.md) on, adults and not elders), who leave their homes and walk to the new yard.
- **Goods.** What the new yard and cottages cost, a new game's starting stores, and `stores_share` of every good left in the mother's stores. The founding cost is gathered from the yards first and then from the settlement's other buildings (bread from the homes' shelves, logs from a sawmill's pile): in a town whose bakeries just keep pace bread never rests in a yard, nor logs beside busy sawmills, and a town of 126 with a dock and 41 idle carriers sent nobody for want of 12 loaves and 4 logs. A crowded settlement feels the need to cross the water as soon as it sees no land left, before its party is ready.
- **Knowledge.** What the founders knew, and every blueprint the mother has proven in use; crafts it never practised stay behind ([knowledge](/systems/knowledge.md)).
- **Custom.** The mother's custom for the dead. A daughter's land may suggest another; it keeps its mother's until it cannot, and then the custom drifts. It keeps its mother's naming custom too, and its settlers their names ([people](/systems/people.md)).

A daughter whose name the world has used already is "New" that name. The daughter plans for itself, keeps visiting and trading with its mother and the others, and the chronicle records the founding in both.
