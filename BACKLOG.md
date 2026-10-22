# PubgOps � improvement backlog

Living list of known issues, product gaps, and engineering work. Prefer fixing from the top of each section when picking up work; mark items done by moving them to **Done** with a short note.

## Bugs

- [ ] **Teammates overflow (>3 in squad list)** — Recent engagements can show more than 3 teammates. Likely bad squad resolution after death (e.g. spectating an enemy team). Audit backend teammate logic in match detail building (`winPlace` / roster), and exclude non-squad members from spectate periods.
- [ ] **Search stuck after a failed lookup** — After a bad/failed player search, subsequent searches (even valid names) stay invalid until a full reset. Clear error + loading state and do not leave context/stats in a poisoned state on failure.

## Replay feature

- [ ] **Care packages** — Show care package spawn / land positions on the map from telemetry.
- [ ] **Shooting lines** — When a player shoots another, draw a shot/hit line (or brief tracer) in the replay from attacker → victim using kill/damage telemetry events.
- [ ] **Replay seeking UX** — Sparse/local replay made scrubbing fast; define clear seeking UX (scrubber precision, keyframe snap vs smooth, keyboard shortcuts, buffered seek) and document expected behavior.

## Product / UX

- [ ] **Survivors dossier content** — Decide which stats belong on the dossier for “precise” player intel (e.g. K/D, ADR, headshot %, survival time, win %, mode splits, rank/season, recent form). Inventory current fields vs gaps, then implement.
- [ ] **Return to frontpage after search** — Once a player is loaded there is no clear path back to the landing/search hero. Add brand/home navigation (header already links home — verify and make “new search” / clear dossier obvious).

## Engineering

- [ ] **Automated tests** — Expand unit/integration coverage for teammate resolution and more frontend replay helpers (baseline CI tests already exist).
- [ ] **Telemetry cache + URL hardening** — `_telemetry_cache` in `telemetry_replay.py` is unbounded and each replay now also holds per-player state/gear. Cap it (LRU by count) and only accept telemetry URLs on PUBG's telemetry CDN host, since the endpoint fetches whatever URL it is given.
- [ ] **CD / deploy** — After CI is green, publish images or deploy the Compose stack to a host (not in CI yet).
- [ ] **Design implementation discipline** — Design changes must be explicit and intentional (follow existing tactical PUBG visual system; no ad-hoc one-off styles). Prefer shared tokens/components over copy-pasted Tailwind.
- [ ] **Isolated reusable components** — Extract UI into reusable components (dossier, match row, replay map, controls) so future surfaces can reuse them without coupling to page containers.

## Done

- [x] **Death / revive visuals in replay** — 2026-10-01: Life state comes from knock / revive / kill / in-game respawn events (`backend/player_state.py`), so recalled players show alive again and dead again on a second death. Bodies stay at the death location. Map shows a live alive count (down on deaths, up on respawns) and the zone phase.
- [x] **Loadout for searched player** — 2026-10-01: Replay sidebar shows the searched player's status, health, armor levels, guns and throwables over time.
- [x] **Blue zone** — 2026-10-01: Replay draws blue zone, white circle and red zones over time, with the current phase shown bottom-right. Phase timings are fitted from `LogGameStatePeriodic` samples in `backend/zone_timeline.py`; interpolated client-side in `frontend/src/utils/zoneMath.ts`.
- [x] **Deployment pipeline (CI)** — 2026-08-07: GitHub Actions on push/PR — quality (ruff/eslint/tsc), unit tests, Docker Compose smoke + live PUBG API integration via Environment `pubg_api_key`. No CD yet.
