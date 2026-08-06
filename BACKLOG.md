# PubgOps � improvement backlog

Living list of known issues, product gaps, and engineering work. Prefer fixing from the top of each section when picking up work; mark items done by moving them to **Done** with a short note.

## Bugs

- [ ] **Teammates overflow (>3 in squad list)** — Recent engagements can show more than 3 teammates. Likely bad squad resolution after death (e.g. spectating an enemy team). Audit backend teammate logic in match detail building (`winPlace` / roster), and exclude non-squad members from spectate periods.
- [ ] **Search stuck after a failed lookup** — After a bad/failed player search, subsequent searches (even valid names) stay invalid until a full reset. Clear error + loading state and do not leave context/stats in a poisoned state on failure.
- [ ] **Death / revive visuals in replay** — Dead players get opacity + “X”, then the dot may disappear. Blue-chip revive should clear dead styling when the player is alive again. Tie UI to telemetry death + revive / respawn events, not a sticky flag.

## Replay feature

- [ ] **Blue zone** — Render the blue zone (and ideally safe zone / white circle) on the map over time from telemetry.
- [ ] **Care packages** — Show care package spawn / land positions on the map from telemetry.
- [ ] **Loadout for searched player** — Show the searched player’s loadout (weapons/equipment) for the match / over time from telemetry or match participant data.
- [ ] **Shooting lines** — When a player shoots another, draw a shot/hit line (or brief tracer) in the replay from attacker → victim using kill/damage telemetry events.
- [ ] **Replay seeking UX** — Sparse/local replay made scrubbing fast; define clear seeking UX (scrubber precision, keyframe snap vs smooth, keyboard shortcuts, buffered seek) and document expected behavior.

## Product / UX

- [ ] **Survivors dossier content** — Decide which stats belong on the dossier for “precise” player intel (e.g. K/D, ADR, headshot %, survival time, win %, mode splits, rank/season, recent form). Inventory current fields vs gaps, then implement.
- [ ] **Return to frontpage after search** — Once a player is loaded there is no clear path back to the landing/search hero. Add brand/home navigation (header already links home — verify and make “new search” / clear dossier obvious).

## Engineering

- [ ] **Automated tests** — Add clean unit/integration tests for new features (backend telemetry parse, teammate resolution, frontend replay helpers) so regressions are caught.
- [ ] **Deployment pipeline** — CI/CD on push (lint/test/build images, deploy or publish artifacts). Align with Docker Compose stack.
- [ ] **Design implementation discipline** — Design changes must be explicit and intentional (follow existing tactical PUBG visual system; no ad-hoc one-off styles). Prefer shared tokens/components over copy-pasted Tailwind.
- [ ] **Isolated reusable components** — Extract UI into reusable components (dossier, match row, replay map, controls) so future surfaces can reuse them without coupling to page containers.

## Done

_(Move completed items here with date + brief note.)_
