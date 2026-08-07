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

### Backend (`pytest -m "not integration"` → `backend/tests/test_telemetry.py`)

| Test | Steps | Looking for |
|------|-------|-------------|
| `test_root_endpoint_returns_correct_message` | `GET /` via FastAPI TestClient | Status `200`; body `{"message":"PubgOps API is running"}` |
| `test_telemetry_endpoint_handles_invalid_url` | `POST /api/match/telemetry` with bad URL | Status `500` (fetch/parse failure path) |
| `test_telemetry_endpoint_handles_missing_url` | `POST /api/match/telemetry` with `{}` | Status `422` (validation rejects missing `telemetry_url`) |
| `test_telemetry_endpoint_processes_valid_data` | Mock gzip telemetry download → `POST /api/match/telemetry` | Status `200`; sparse `tracks` for player; map Erangel; scale `816000`; no legacy dense position payloads |
| `test_frame_endpoint_interpolates` | Build/cache sparse replay → `GET /api/match/telemetry/frame?t=15` | Status `200`; one player `Rinneus`; `x` between keyframes (~500–650); `team_id` 12 |
| `test_map_scale_sanhok` | `build_sparse_replay` for Savage_Main | Map name Sanhok; scale `408000`; position at half-map ≈ `500` |

### Frontend (`npm run test:ci` → `frontend/src/utils/replayMath.test.ts`)

| Test | Steps | Looking for |
|------|-------|-------------|
| `formatDuration pads seconds` | Call `formatDuration(0/65/600)` | `"0:00"`, `"1:05"`, `"10:00"` |
| `lerp interpolates between endpoints` | Call `lerp` at u=0, 1, 0.5, 0.25 | Exact linear blends (`0`, `100`, `50`, `12.5`) |

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
