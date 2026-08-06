#!/usr/bin/env sh
set -e
cd "$(dirname "$0")"

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is not installed or not on PATH."
  echo "Install Docker, then run ./start.sh again."
  exit 1
fi

if [ ! -f backend/.env ]; then
  if [ -f backend/.env.example ]; then
    cp backend/.env.example backend/.env
    echo "Created backend/.env from .env.example — set PUBG_API_KEY, then re-run."
    exit 1
  fi
  echo "Create backend/.env with PUBG_API_KEY=your_key"
  exit 1
fi

echo "Building and starting PubgOps containers..."
echo "  Frontend: http://localhost:3000"
echo "  Backend:  http://localhost:8000"
docker compose up --build
