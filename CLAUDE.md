# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

PubgOps is a PUBG player dashboard: lifetime stats, recent matches, and a map telemetry replay. A FastAPI backend (`backend/`) proxies the official PUBG API; a React/TypeScript CRA frontend (`frontend/`) is served by nginx in production. Both run as a Docker Compose stack.

## Commands

Full stack (needs `backend/.env` with `PUBG_API_KEY`): `docker compose up --build` (or `start.bat` / `start.sh`). Frontend → http://localhost:3000, backend → http://localhost:8000.

Backend (run from `backend/`):
```bash
python -m pip install -r requirements-dev.txt
python main.py                          # dev server on :8000
python -m ruff check . && python -m ruff format --check .
python -m pytest -m "not integration"   # offline unit/API tests
python -m pytest tests/test_telemetry.py::test_frame_endpoint_interpolates   # single test
python -m pytest -m integration         # live: needs running stack + real key
```
Integration tests hit `PUBGOPS_BASE_URL` (default `http://localhost:8000`) using player `PUBGOPS_TEST_PLAYER` (default `shroud`). Pytest markers `api` / `integration` are defined in `backend/pyproject.toml`.

Frontend (run from `frontend/`):
```bash
npm install
npm start                    # dev server on :3000
npm run typecheck            # tsc --noEmit
npm run lint                 # eslint, --max-warnings 0
npm run test:ci              # Jest, non-watch
npx react-scripts test --watchAll=false src/utils/replayMath.test.ts   # single file
```
Set `REACT_APP_API_BASE_URL` if the API is not on `http://localhost:8000` (baked in at build time in the Docker image).

## CI

`.github/workflows/ci.yml` runs three stages on every push/PR: **Quality** (ruff check + format, tsc, eslint) → **Unit** (offline pytest, Jest) → **Stack + live API** (Compose up, smoke `/` and frontend, then `pytest -m integration`). In CI the GitHub Environment `pubg_api_key` (`API_KEY`) maps to `PUBG_API_KEY`. When adding/changing CI checks or tests, keep `.github/ci-checklist.md` in sync (CI prints it into job summaries). There is no CD — don't add deploy jobs unless asked. Don't weaken or delete tests to get CI green.

## Architecture

**Backend**
- `main.py` holds routes and PUBG API calls (sync `requests`). It reads `PUBG_API_KEY` from `backend/.env` and **raises at import time if it's missing**. `tests/conftest.py` sets a dummy key before `main` is imported, so tests must keep that ordering.
- Player lookup (`_find_player`) tries shards in order: `steam`, `kakao`, `psn`, `xbox`, `stadia`. `/player/{name}/matches` fetches the last 10 match details in parallel with a `ThreadPoolExecutor` and builds match rows with display-style keys (`"Win Place"`, `"Game Mode"`, `Telemetry_Link`, …). The frontend types mirror those exact keys.
- `telemetry_replay.py` holds all telemetry parsing. `build_sparse_replay` turns the raw telemetry event list into per-player sparse `Keyframe` tracks plus kill events (deduped by victim + `_D`). Positions are normalized to a 0–1000 map space using per-map scales. `ProcessedReplay` objects are cached **in process memory**, keyed by telemetry URL, so the cache is lost on restart and not shared between workers.
- `zone_timeline.py` rebuilds the blue zone / white circle / red zone timeline from `LogGameStatePeriodic` (~10 s samples). Shrinks are linear, so exact shrink start/end times are recovered by fitting radius over the shrinking samples. The output is per-phase `{white, appear_t, shrink_start_t, shrink_end_t, dps}`, and the frontend's `utils/zoneMath.ts` interpolates it. `LogPhaseChange` and other non-position events carry only `_D` wall-clock time, which drifts several seconds from `elapsedTime`. Convert them with `telemetry_clock.TelemetryClock` and don't mix the two clocks.
- `player_state.py` builds per-player change lists in one pass: life (knocked/dead/alive again after a blue-chip respawn, which is an in-game `LogPlayerCreate`), health, activity and gear. It also builds the alive count, which matches the game's `numAlivePlayers`. It also builds cumulative combat stats (damage to other teams, `killer`-credited kills, knocks), which match the match-stats API. The payload sends `life` for all tracked players, but `player_state` only for the requested `player_name` and `teammates` only for that player's squad (same `teamId`).
- `POST /api/match/telemetry` returns the full sparse track payload (`load_payload`). `GET /api/match/telemetry/frame` interpolates positions server-side at time `t` and auto-loads the replay on a cache miss.
- Map-name mapping (`MAP_NAMES`) is duplicated in `main.py` and `telemetry_replay.py`.

**Frontend**
- `App.tsx` defines routes `/` (`PubgStats`, search + match list) and `/player/:playerName/match/:matchId` (`MatchDetails`).
- `PubgStatsContext` holds the search results in memory. Match detail pages read match data from this context, so deep-linking or refreshing a match page has no data. Users must navigate there from search results.
- `MatchDetails` loads the telemetry once. `TelemetryOverlay` then does playback, scrubbing and zoom/pan **entirely client-side**: it interpolates between sparse keyframes in a `requestAnimationFrame` loop (`utils/replayMath.ts`) and renders over the map images in `src/assets/Pubg/map_images/`.

## Project conventions (from `.cursor/rules/`)

- `BACKLOG.md` is the product memory. Check it before proposing large features. Add reported bugs or "remember later" items there, prefer fixing listed **Bugs** first, and move finished items to **Done** with a short note.
- UI: follow the existing tactical PUBG look (`tact-*` Tailwind tokens in `tailwind.config.js`, display/mono fonts, clipped panels). Don't introduce a second visual language. Avoid heavy blur, full-page noise, or continuous animations on scrollable lists.
- Keep components isolated, reusable and props-driven: the replay map, playback controls, dossier stats and match rows. Telemetry parsing belongs in dedicated backend modules (e.g. `telemetry_replay.py`), not in route handlers.
- Ship focused tests with new behavior: pytest for API/telemetry logic, Jest for pure frontend helpers (lerp, teammate rules).
- Deployment work targets the Compose/container builds. Secrets stay in env / `backend/.env`.
