# Frontend polish plan

Source: screenshots of the running stack (desktop 1440×900, mobile 390×844), taken 2026-10-22 with headless Chrome against
`localhost:3000`. Players: `shroud` (no recent matches) and `TGLTN`. Screenshots are in the session scratchpad and were not committed.

Order: fix what is visibly broken → small polish → match page flow. Each task is one vertical slice with its own check.
No redesign: everything stays in the existing `tact-*` look.

## Findings (evidence)

| # | What | Where | Evidence |
|---|------|-------|----------|
| F1 | **Replay map doesn't render on mobile.** Below `lg` the map container collapses to 0 px. Only the operator panel shows. | `TelemetryOverlay.tsx:558` `flex-1` (flex-basis 0 in a `flex-col` parent beats the inline `height`) | mob-5-replay.png |
| F2 | **"Search stuck after failed lookup" (BACKLOG bug) is a rate limit.** A miss costs ~10 PUBG calls (5 shards × 2 parallel endpoints). That uses up the 10/min key budget. The next search gets `429` on every shard, and `_find_player` reports it as "Player not found". | `backend/main.py:81` `_find_player`, `PubgStats.tsx:146` | backend log: `Shard steam returned 429` → 404 |
| F3 | Success toast overflows the viewport on desktop ("Intel locked for shro…") | `PubgStats.tsx:237` | desk-3-dossier.png |
| F4 | Empty match list shows "0 reports" and nothing else (PUBG only keeps 14 days) | `PubgStats.tsx:317` | shroud dossier |
| F5 | `Duration` is `timeSurvived` but is shown like the match length ("1:24" for a 21:12 match) | `main.py:329`, list row + match header | desk-4-match vs replay clock |
| F6 | The search box edits the context `playerName` directly. Typing a new name before searching changes the name used for match links and the replay focus. | `PubgStats.tsx:197,225` + `MatchDetails.tsx:105` | code read |
| F7 | Large numbers aren't formatted (`15383627`). The Damage crosshair icon is almost invisible (dark on dark). | dossier tiles | desk-3-dossier.png |
| F8 | Match page: the replay (the main feature) is below the fold behind a manual "LOAD REPLAY" click | `MatchDetails.tsx` | desk-4-match.png |
| F9 | Refresh or deep link on a match page → "Match not found" (context is memory only) | `PubgStatsContext.tsx` | mob-6-refresh.png |
| F10 | Slower/Faster use near-identical lightning icons. The header "Live feed" dot is decorative and suggests a live data feed that doesn't exist. | `TelemetryOverlay.tsx:147-167`, `App.tsx:29` | desk-5b |
| F11 | Map PNGs are 1.4–3.2 MB each (21 MB total) | `assets/Pubg/map_images/compressed` | `du` |

## Phase 1: broken (do first)

**T1. Mobile replay map** (F1): use `lg:flex-1` on the map container, so the inline height applies when stacked.
- Accept: at 390 px the map is visible and square, with the operator panel above it. Desktop is unchanged.
- Verify: re-shoot mob + desk replay screenshots.

**T2. Rate limit is not "not found"** (F2, closes BACKLOG bug):
- Backend: in `_find_player`, if any shard returned 429 and none matched, raise `HTTPException(429, "PUBG API rate limit hit, retry in a minute")`.
- Frontend: request `/matches` only after `/player` succeeds, so a miss costs 5 calls, not 10.
- Accept: miss then hit within a minute shows the rate-limit message, not "Player not found". A miss on its own still says not found.
- Verify: pytest for the 429 → 429 path (mock `requests.get`). Manual miss→hit.

**T3. Search draft vs. loaded player** (F6): keep the input in local `useState`. Write `playerName` to context only on success.
- Accept: typing in the box without submitting doesn't change match links or the replay focus.
- Verify: manual. Typecheck.

## Checkpoint A
`npm run typecheck && npm run lint && npm run test:ci`, `pytest -m "not integration"`, ruff. Re-shoot screenshots.

## Phase 2: polish (small, independent)

**T4. Delete the toast** (F3). The dossier appearing is the feedback. Fewer moving parts than repositioning it.
**T5. Empty state** (F4): "No matches in the last 14 days" panel when `matches.length === 0`.
**T6. "Survived" label** (F5): show `Survived 1:24` in the list row and match header. Keep the backend key (CI/type contract).
**T7. Number format + icon** (F7): `n.toLocaleString()` on dossier/match values. `invert` or brighten the crosshair icon.
**T8. Controls/header** (F10): text `−`/`+` for speed (or distinct icons) with aria-labels kept. Remove the fake "Live feed" dot.
- Accept (all): visible in re-shot screenshots. lint/typecheck clean.

## Checkpoint B
Same commands plus screenshots.

## Phase 3: match page flow

**T9. Replay first** (F8): auto-load telemetry on mount (CDN fetch, not rate-limited). Move the map section above the stat grid.
- Accept: opening a match shows the loading state, then the map, without scrolling or clicking. Load errors still show.
**T10. Survive refresh** (F9): persist `{playerName, stats, matches}` to `sessionStorage` in the provider, in try/catch.
- Accept: refreshing a match page keeps working in the same tab. A fresh tab with a deep link still shows the "Match not found" path.

**T11 (optional). Map images → WebP** (F11): roughly 5× smaller. One-off conversion, swap the imports.

## Checkpoint C
Full CI-equivalent locally. Move the fixed BACKLOG items to **Done**. Add F1/F5/F6/F9 to BACKLOG if they aren't fixed.

## Not planned (on purpose)
- Visual redesign or a new design language: the current tactical look holds up in the screenshots.
- Component extraction refactor (BACKLOG "Isolated reusable components"): no new surface needs it yet.
- Dossier content expansion: that's a product decision (BACKLOG item), not polish.
