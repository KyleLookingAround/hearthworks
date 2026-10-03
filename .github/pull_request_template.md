## What this does

<!-- One or two sentences a player would understand, then the detail. Which roadmap phase does it serve? -->

## Changes

<!-- Group by area and delete the ones you didn't touch. -->

- **Sim** (`src/sim/`):
- **Design bundle** (`design/`):
- **Gates**:
- **UI** (`src/ui/`, `src/render/`, `static/`):

## Gates

<!-- Paste `npm run gates` output. If gameplay or tuning changed, add a seed sweep (7, 42, 99, 2026, 31337) for the affected gates and note anything that moved compared with main. -->

| Gate | Seed 1847 | Sweep | Moved vs main? |
| --- | --- | --- | --- |
| 01 | | | |
| 02 | | | |
| 03 | | | |
| 04 | | | |

## Checklist (from CLAUDE.md)

- [ ] `npm run ci` is green locally
- [ ] Balance numbers live in a concept's `tuning:` or frontmatter, not hard-coded in `src/`
- [ ] Changed concepts have an updated `generated: { by, at }`
- [ ] No `verified` entry with a `human:` actor (only Kyle verifies, after playtesting)
- [ ] Dated bullet added to `design/log.md`
- [ ] `npm run okf` run, so the indexes are in sync
- [ ] No gate scenario edited to make a gate pass (if one had to change, the reason is in the gate's body and the log)
- [ ] Superseded concepts are deprecated, not deleted
- [ ] `src/sim/` stays deterministic and DOM-free (randomness only through `rand(S.rng)`)

## Playtest notes

<!-- For UI or balance changes: what to look at in `npm run dev`, which seed, and screenshots if the look changed. Write "none" if nothing is player-visible. -->
