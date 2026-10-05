---
type: Decision
title: "0005: Gates may be relaxed a little to make room for depth"
description: Kyle allows thresholds to be loosened modestly when a change gives the game more depth; the old gate is still superseded and kept, and every loosening is logged and reported.
tags: [decision, gates, process]
status: stable
generated: { by: claude/opus-5.5, at: 2026-10-05T01:36:28Z }
sources:
  - id: kyle-relax
    resource: conversation with Kyle on 2026-10-05
    title: Kyle allows gates to be relaxed for depth
    author: human:kyle
---

# Decision

Kyle has allowed the gates to be relaxed a bit, so that more changes can be made to the game for better depth.[^kyle-relax] This extends [decision 0004](/decisions/0004-reworking-gates.md): there, any loosening had to be argued as the design moving under the gate. Now a change that makes the game deeper (a new mechanism, a richer economy, a choice the villages make for themselves) may loosen a gate it disturbs, where the gate held a number the deeper game no longer needs to hit exactly.

# Limits

- **A bit.** A threshold may move modestly, within what the seeds already vary by (about a fifth either way on default new games), never so far that the gate stops proving its phase. A check is never dropped: what a gate proves stays proven.
- **For depth, not to hide a bug.** A failing gate is still a bug report first ([decision 0004](/decisions/0004-reworking-gates.md)). Loosening is for a change that is better for the game and moves a number, not for a change that breaks what the gate tests.
- **Measured.** The change is measured on the gate's seeds and on default new games before and after, and the loosening is set from what the game now does, with headroom no wider than the spread of the seeds.

# How

As 0004 says for loosening: a new gate supersedes the old, which is deprecated and kept, runnable by name; a log bullet records old and new values and why; and every loosening is called out to Kyle in the report. Kyle can overrule any of it.

[^kyle-relax]: Kyle allows gates to be relaxed for depth
