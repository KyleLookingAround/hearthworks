---
type: Decision
title: "0004: Gates may be reworked as the game grows"
description: Gates change when the design moves under them, never to turn a failing gate green; small changes are revised in place, larger ones supersede the old gate, which is deprecated and kept.
tags: [decision, gates, process]
status: stable
generated: { by: claude/opus-5.5, at: 2026-10-03T10:41:51Z }
sources:
  - id: kyle-rework
    resource: conversation with Kyle on 2026-10-03
    title: Kyle allows gates to be reworked
    author: human:kyle
---

# Decision

Gates are sanctioned computations, but they are not frozen. Kyle has allowed them to be reworked as the game changes.[^kyle-rework] The roadmap ahead (big islands, solid buildings, mood from surroundings, districts) will move the ground under every existing gate.

# When a gate may be reworked

- The design moved, so the gate no longer tests what it was written to test: the map grows, buildings become solid, mood gains new parts, a phase replaces what the gate scripted.
- The gate has become too loose to prove anything (for example, [Gate 4](/gates/04-village-plans.md) passes at four times its population threshold).
- A metric it reads is renamed or replaced.

# When it may not

- **Never to turn a failing gate green.** A failing gate is a bug report against the game first: find the cause and fix the game or the tuning. A rework is legitimate only if the gate's intent stays the same or gets stricter, and that has to be argued in writing.

# How

- **Revise in place** for small changes that keep the intent: new parameter defaults, tighter thresholds, an added metric or check. Add a dated entry to the gate's  section (old value to new value, and why) and a bullet in the [log](/log.md).
- **Supersede** for anything larger: a new scenario, a changed intent, or any threshold made looser. Write a new gate concept and scenario, mark the old gate `status: deprecated` with a `# Superseded` note linking its replacement, and keep both files. Deprecated gates are left out of `npm test` and `npm run gates` but can still be run by name, so history stays reproducible.
- **Loosening is always reported.** Tightening is free; any threshold made looser is called out to Kyle in the report, with what the game achieves and why the old bar no longer fits.
- **Kyle has the last word.** Thresholds remain his to overrule, and only he adds `human:` verification.

[^kyle-rework]: Kyle allows gates to be reworked
