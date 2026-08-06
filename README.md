# PubgOps

PUBG player ops dashboard — stats, match history, and map telemetry replay.

## Structure

```
PubgOps/
├── frontend/           React UI (built into an nginx container)
├── backend/            FastAPI proxy to the official PUBG API
├── docker-compose.yml  Container stack
└── start.bat / start.sh
```

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (or Docker Engine + Compose)
- A [PUBG developer API key](https://developer.pubg.com/)

## Quick start (Docker)

1. Copy the env template and add your API key:

```bash
copy backend\.env.example backend\.env
# edit backend\.env → PUBG_API_KEY=...
```

2. Start the stack:

```bash
# Windows
start.bat

# macOS / Linux
./start.sh

# or
docker compose up --build
```

| Service  | URL |
|----------|-----|
| Frontend | http://localhost:3000 |
| Backend  | http://localhost:8000 |

Stop with `Ctrl+C`, or in another terminal:

```bash
docker compose down
```

## Local development (without Docker)

### Backend

```bash
cd backend
python -m pip install -r requirements.txt
copy .env.example .env   # set PUBG_API_KEY
python main.py
```

### Frontend

```bash
cd frontend
npm install
npm start
```

Optional: `REACT_APP_API_BASE_URL` in `frontend/.env` if the API is not on `http://localhost:8000`.

## Features

- Search a player by name (e.g. `TGLTN`)
- Lifetime stats: matches, kills, damage, most kills
- Recent match list with placement, teammates, and combat stats
- Match detail page with map telemetry playback (play/pause, scrub, zoom/pan)

## API endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | Health check |
| GET | `/player/{name}` | Lifetime player stats |
| GET | `/player/{name}/matches` | Recent matches (last 10) |
| POST | `/api/match/telemetry` | Load sparse telemetry for map playback |
| GET | `/api/match/telemetry/frame` | Optional server-side frame at time `t` |

## Notes

- Match detail pages rely on in-memory React context from a prior search — open matches from the search results rather than deep-linking after a refresh.
- The backend tries shards in order: `steam`, `kakao`, `psn`, `xbox`, `stadia`.
- `PUBG_API_KEY` is injected via `backend/.env` (never baked into the image).

## Backlog

Known bugs and planned improvements live in [BACKLOG.md](BACKLOG.md). Cursor rules under `.cursor/rules/` point agents at that list, design/component standards, and test/deploy expectations.
