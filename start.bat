@echo off
setlocal
cd /d "%~dp0"

where docker >nul 2>&1
if errorlevel 1 (
  echo Docker is not installed or not on PATH.
  echo Install Docker Desktop from https://www.docker.com/products/docker-desktop/
  echo Then open a NEW terminal and run start.bat again.
  pause
  exit /b 1
)

if not exist "backend\.env" (
  echo backend\.env is missing.
  if exist "backend\.env.example" (
    copy /Y "backend\.env.example" "backend\.env" >nul
    echo Created backend\.env from .env.example — set PUBG_API_KEY before continuing.
    notepad "backend\.env"
  ) else (
    echo Create backend\.env with PUBG_API_KEY=your_key
    pause
    exit /b 1
  )
)

echo Building and starting PubgOps containers...
echo   Frontend: http://localhost:3000
echo   Backend:  http://localhost:8000
echo.
echo Press Ctrl+C to stop.
echo.

docker compose up --build
endlocal
