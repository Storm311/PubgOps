# PubgOps CI checklist

What each stage runs, and what a pass means. CI prints the matching section before it executes.

## 1 · Quality

Static checks only — no servers, no PUBG API.

| Check | Command | Looking for |
|-------|---------|-------------|
| Backend lint | `ruff check .` | No unused imports, undefined names, or other lint errors in `backend/` |
| Backend format | `ruff format --check .` | Python files already match ruff formatting (no silent reformat drift) |
| Frontend types | `npm run typecheck` (`tsc --noEmit`) | TypeScript compiles; no type errors under `frontend/src` |
| Frontend lint | `npm run lint` (`eslint src`) | No ESLint errors or warnings in frontend source |

## 2 · Unit tests

Offline tests against repo code. Dummy `PUBG_API_KEY=test_api_key` so the app can import; no live PUBG calls.

### Backend (`pytest -m "not integration"` → `backend/tests/test_telemetry.py`, `test_zone_timeline.py`, `test_player_state.py`)

| Test | Steps | Looking for |
|------|-------|-------------|
| `test_root_endpoint_returns_correct_message` | `GET /` via FastAPI TestClient | Status `200`; body `{"message":"PubgOps API is running"}` |
| `test_telemetry_endpoint_handles_invalid_url` | `POST /api/match/telemetry` with bad URL | Status `500` (fetch/parse failure path) |
| `test_telemetry_endpoint_handles_missing_url` | `POST /api/match/telemetry` with `{}` | Status `422` (validation rejects missing `telemetry_url`) |
| `test_telemetry_endpoint_processes_valid_data` | Mock gzip telemetry download → `POST /api/match/telemetry` | Status `200`; sparse `tracks` for player; map Erangel; scale `816000`; no legacy dense position payloads |
| `test_frame_endpoint_interpolates` | Build/cache sparse replay → `GET /api/match/telemetry/frame?t=15` | Status `200`; one player `Rinneus`; `x` between keyframes (~500–650); `team_id` 12 |
| `test_map_scale_sanhok` | `build_sparse_replay` for Savage_Main | Map name Sanhok; scale `408000`; position at half-map ≈ `500` |
| `test_real_match_phases_are_sequential` | `build_zone_timeline` on real Sanhok fixture (`tests/fixtures/zone_sanhok.json`) | 7 phases; each white circle appears when the previous shrink ends and is smaller |
| `test_real_match_shrink_timing_is_recovered` | Same fixture | Fitted shrink/wait windows match game timers (±1.5 s); last phase has no shrink |
| `test_real_match_zone_damage_ramps_up` | Same fixture | Phase 1 zone dmg `0.4`/s; dmg never decreases across phases |
| `test_shrink_interpolates_exactly_between_sparse_samples` | Synthetic shrink 100→200 s sampled every 30 s | Shrink start `100`, end `200`; next phase appears at `200` |
| `test_red_zone_spans_samples` | Synthetic red zone in two samples | One red zone, `20`→`40` |
| `test_no_zone_data_returns_none` | Game state without zone fields / without white circle | `None` |
| `test_payload_includes_normalized_zone` | `load_payload` on Sanhok fixture | `zone` in 0–1000 map space (center `500,500`); 7 phases |
| `test_life_cycle_handles_revive_respawn_and_second_death` | Synthetic knock → revive → kill → respawn → kill | Life: knocked, alive, dead, alive, dead |
| `test_alive_count_drops_on_death_and_rises_on_respawn` | Same match, 3 starting players | Alive counts `3, 2, 3, 2, 1` |
| `test_dead_body_holds_position_until_respawn` | `build_sparse_replay` on same match | Death keyframe at kill location (dead); alive again after respawn |
| `test_payload_has_life_alive_counts_and_focus_player` | `load_payload(…, "a")` | `life`, `alive_counts`, case-insensitive `player_state` + `focus_name`; unknown player → `None` |
| `test_loadout_tracks_guns_armor_and_throwables` | Synthetic equip / pickup / throw / unequip / armor destroy | Guns ordered by slot; armor levels; throwable counts; parachute pack ignored; broken vest cleared |
| `test_combat_counts_enemy_damage_kills_and_knocks_and_lists_teammates` | Synthetic damage / knock / kill incl. team damage and a team kill | Combat `{damage 40.5, kills 1, knocks 1}` (teammates excluded); `teammates` lists squad mate |
| `test_same_instant_kills_each_count_and_rejoin_keeps_gear` | Synthetic two kills at one `_D` + in-game `LogPlayerCreate` while alive | Two kill markers; alive `3, 2, 1`; loadout kept after rejoin |
| `test_clock_maps_wall_time_onto_elapsed_with_drift` | `TelemetryClock` with 5 s drift | Wall-clock events interpolated onto elapsedTime |

### Frontend (`npm run test:ci` → `frontend/src/utils/replayMath.test.ts`, `zoneMath.test.ts`, `playerState.test.ts`)

| Test | Steps | Looking for |
|------|-------|-------------|
| `formatDuration pads seconds` | Call `formatDuration(0/65/600)` | `"0:00"`, `"1:05"`, `"10:00"` |
| `lerp interpolates between endpoints` | Call `lerp` at u=0, 1, 0.5, 0.25 | Exact linear blends (`0`, `100`, `50`, `12.5`) |
| `valueAt` / `itemLabel` / `snapshotAt` (4 tests) | Step-series lookups, item names, per-player snapshot | Values hold until next change (dead → respawned → dead); telemetry ids → in-game names; defaults before first change |
| `zoneAt` (6 tests) | Two-phase synthetic zone timeline at various `t` | Pre-zone / waiting / shrinking / next-phase states; linear blue shrink onto white; countdowns; red zone window |

## 3 · Stack + live API

Real Docker Compose stack + real PUBG API (Environment `pubg_api_key`).

| Step | What runs | Looking for |
|------|-----------|-------------|
| Prepare API key | Trim `API_KEY` → `PUBG_API_KEY`, write `backend/.env` | Non-empty key after trim (trailing newlines stripped) |
| Compose up | `docker compose up -d --build` | Backend + frontend containers start |
| Backend health | Poll `GET http://localhost:8000/` | HTTP success within ~2 minutes |
| Smoke — API | `GET http://localhost:8000/` | Body contains `PubgOps API is running` |
| Smoke — UI | `GET http://localhost:3000/` | HTTP `200` |
| `test_root_via_running_stack` | HTTP to running backend `/` | Same health JSON as unit root test |
| `test_live_player_stats` | `GET /player/{PUBGOPS_TEST_PLAYER}` (default `shroud`) | `200`; `player_name`, `platform`, `stats.total_matches` present; fail clearly on 401/429/5xx |
| `test_live_player_matches` | `GET /player/{name}/matches` | `200` + list; if non-empty, first item has `match_id` and `Map` or `Kills` |
