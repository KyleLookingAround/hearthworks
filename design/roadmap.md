---
type: Roadmap
title: Roadmap
description: Phases from the player-placed prototype to a self-building civilisation, each closed by a headless gate.
tags: [roadmap]
status: draft
generated: { by: claude/opus-5.5, at: 2026-10-03T10:30:27Z }
---

# Phases

Each phase closes when its gate passes in CI. Gates are [Attested Computations](/gates/): a sanctioned scenario runs headless and deterministic code checks the receipt.

| Phase | Goal | Gate | State |
| --- | --- | --- | --- |
| 1. Toy economy | Grid, building, wood chain carried by hand | [Gate 1](/gates/01-first-plank.md) | Done |
| 2. Living town | Houses, needs, bread chain, newcomers and departures | [Gate 2](/gates/02-sustain-town.md) | Done |
| 3. First automation | Courier bots on the same job board | [Gate 3](/gates/03-couriers.md) | Done |
| 4. The village plans | [Planner](/systems/planner.md) chooses and places buildings | [Gate 4](/gates/04-village-plans.md) | Done |
| 5. Knowledge | Blueprints discovered, verified by use, shared, forgotten ([knowledge](/systems/knowledge.md)) | [Gate 5](/gates/05-knowledge-spreads.md) | Done |
| 6. Civilisation | Settlements split off, trade, eras of technology | To define | Next |

# Rule

Phase 4 started by turning [Gate 2's scripted build order](/references/scenarios/sustain-town.ts) into the planner: if the planner cannot match the script, it is not ready. [Gate 4](/gates/04-village-plans.md) holds it to Gate 2's thresholds with no build calls at all, and it passes on every swept seed (see the [log](/log.md)).
