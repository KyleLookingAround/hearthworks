---
type: System
title: The sea
description: Shallows along every shore and reefs out at sea on the sea maps; charts - a settlement knows only the islands it has seen, settles only on charted land, and sends explorers out for the rest; and ships - every boat belongs to a settlement's fleet, built at its docks and shipyard, and a crossing takes one.
tags: [water, settlement, map]
status: draft
generated: { by: claude/opus-5.5, at: 2026-10-06T06:43:46Z }
tuning:
  shallow_tiles: 2
  shallow_speed: 0.6
  reef_from_tiles: 3
  reef_to_tiles: 7
  reef_cell: 6
  sight_tiles: 16
  look_every_seconds: 60
  explore_every_seconds: 240
  dock_boats: 1
  party_boat_planks: 6
  villagers_per_boat: 8
  fleet_max: 6
  boatless_memory_seconds: 300
  shipyard_weight: 0.4
  boat_names: [Heron, Gull, Tern, Otter, Kingfisher, Puffin, Seal, Minnow, Swallow, Plover, Curlew, Dipper, Cormorant, Wren, Mallard, Grebe]
---

# Idea

Phase 18 delivered rowing boats that carry everyone anywhere across one flat sea. The sea's second pass gives the water a shape and the world a frontier. Code: `src/sim/sea.ts`.

# Shallows and reefs

On maps with a `sea` block ([Islands](/maps/islands.md), [Archipelago](/maps/archipelago.md), [Coast](/maps/coast.md)), water within `shallow_tiles` of land is shallow: boats there go at `shallow_speed` of their speed on open water, so a crossing is quick in the channel and slow along the shore. Reefs lie in clumps (noise of cell `reef_cell`) `reef_from_tiles` to `reef_to_tiles` out from land, over about the map's `reefs` share of that water; boats never row over one and route around it. A reef never closes off any water from the rest of its sea (reefs that would are washed away when the world is made), and never lies where a dock launches, so every shore a boat can reach without reefs it can still reach. They come from their own random stream, so the land of every seed stays as it was. The renderer draws shallows lighter and reefs as broken white water. Maps without a `sea` block (the Lone isle, Landmass) have neither.

# Islands

An island is land joined by land or by shallows (`shallow_tiles` of land, on every map), so the two banks of a river are one island and islets a stone's throw apart are one group. Islands are worked out once a world, from its ground.

# Charts

Charts are on in new games (with settling: the new-game screen's settling box turns both on) and off in older scenarios (`charts`). With charts on:

- **The horizon.** Every `look_every_seconds` a settlement charts the islands it has built on and every island with land within `sight_tiles` of their shores: what its people see from the beach. The rest of the world is unknown to it.
- **Boats chart.** A visitor or porter rowing notes the islands within `sight_tiles` of their boat; the settlement they reach takes in the charts of the one they came from and what they saw, and so does home when they get back. Charts spread between neighbours as news does.
- **Settling.** A founding party chooses among sites on charted land only, judged as the first neighbours were but against the land it knows ([settling](/systems/settling.md)): a village that knows of no better land than its own island settles at home first, where without charts its party would have rowed for the best land anywhere. One with nowhere charted left to go, but islands it has not charted, wants to know what lies over the sea (`explore`): it comes up with the [dock](/blueprints/dock.md) as for a crossing and builds one.
- **Explorers.** Every `explore_every_seconds` at most, a settlement with a dock of its own sends a grown carrier (never its last) to row for the nearest land it has not charted (following the birds): at once if it wants land to settle, otherwise once it has people to spare for visits (`visit_min_villagers` in [knowledge](/systems/knowledge.md)). They land, turn for home, and when they get there the settlement charts the island and everything they saw on the way, into the chronicle. One explorer is out at a time. The Steward panel shows how many islands a settlement has charted and whether an explorer is at sea.
- A daughter keeps her mother's charts.

# Ships

Ships are on in new games (with settling and charts: the new-game screen's settling box turns all three on) and off in older scenarios (`ships`), where anyone rows from any dock as before. Code: `src/sim/ships.ts`. With ships on:

- **A fleet.** Every boat belongs to a settlement. A [Dock](/blueprints/dock.md) is built with `dock_boats` of them; the [Shipyard](/blueprints/shipyard.md) builds more from planks while the settlement has fewer than it wants. It wants one more than it has while its people have stayed ashore for want of a free boat within `boatless_memory_seconds`, and otherwise those it has (at least one), so the fleet grows by the trips refused, not by headcount; never more than one for every `villagers_per_boat` people, nor `fleet_max` in all. Each boat has a name from `boat_names`, picked by its number and the world's seed (never a random stream), one its fleet does not already have. The first boat and every launch go into the chronicle.
- **Crews.** Only someone crewing a boat of their settlement's rows, launching from that settlement's own docks, or from any shore once they are away from its island (the boat is pulled up beside them). A visitor, a porter or an explorer setting out takes a free boat if their way crosses water, and crews it until their visit is over; with none free they go only if they can walk, and otherwise stay ashore. Carriers, builders and newcomers never row.
- **Settlers.** A founding party bound over the water builds a boat of its own at its settlement's dock from `party_boat_planks` planks it takes with the rest of its founding cost, and goes all in it; the boat stays with the daughter once they land, so a colony has a boat from its first day, to row home in once it has a dock. The settlers are its crew until each of them stands on their new island: one whose way is cut short (a building put up across it) sets off again in the boat, rather than being left on the wrong shore with no boat. The mother keeps its fleet: a settlement that sends settlers because its island is full has no room left for a shipyard.
- **Wanting boats.** A settlement with a dock whose people stayed ashore for want of a boat within `boatless_memory_seconds` feels the need `boats`: it comes up with the shipyard, and its planner builds one (`shipyard_weight`) while its fleet wants boats.
- The dock's inspector names the boats moored and how many are out, and the Steward panel lists the fleet.

A boat is a thing a settlement owns, with a crew and a home port. Cargo boats on sea routes, a boatman with a schedule and a dozen goods aboard ([roadmap](/roadmap.md) Phase 23, Leagues), are boats of this fleet given a route; this pass leaves them for Leagues.

# Not yet

Crewed ships for the open sea (bigger boats, longer voyages) and sea routes for goods: cargo boats come with the [roadmap](/roadmap.md)'s Leagues, on this fleet.
