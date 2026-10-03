---
type: System
title: Settling
description: A crowded settlement sends a founding party off to found a daughter town, with villagers, stores, the knowledge it practises and its custom.
tags: [settlement, people, knowledge]
status: stable
generated: { by: claude/opus-5.5, at: 2026-10-03T19:56:47Z }
tuning:
  check_every_seconds: 60
  min_villagers: 70
  cooldown_seconds: 1200
  party_size: 6
  max_settlements: 8
  stores_share: 0.25
---

# Idea

Settlements beget settlements. Settling is on in every new game and off in scenarios that predate it. Code: `src/sim/settle.ts`.

# When

Every `check_every_seconds` a self-planning settlement with at least `min_villagers` people, and none sent from it in the last `cooldown_seconds`, sends a founding party if it can pay for the new storage yard and two cottages, and the starting stores a new game begins with (`storage` in [settlement](/systems/settlement.md)), from its own stores, while the world has fewer than `max_settlements` settlements.

# Where

The party looks for a site as the world's first neighbours were placed ([settlement](/systems/settlement.md)): the whole starting layout on open grass, at least `neighbour_min_distance` from every settlement, with room to grow, scored for room and wood, reachable on foot from its mother unless the map allows neighbours across water.

# Who and what

- **People.** `party_size` villagers who are not working (carriers first; with [people](/systems/people.md) on, adults and not elders), who leave their homes and walk to the new yard.
- **Goods.** What the new yard and cottages cost, a new game's starting stores, and `stores_share` of every good left in the mother's stores.
- **Knowledge.** What the founders knew, and every blueprint the mother has proven in use; crafts it never practised stay behind ([knowledge](/systems/knowledge.md)).
- **Custom.** The mother's custom for the dead. A daughter's land may suggest another; it keeps its mother's until it cannot, and then the custom drifts.

A daughter whose name the world has used already is "New" that name. The daughter plans for itself, keeps visiting and trading with its mother and the others, and the chronicle records the founding in both.
