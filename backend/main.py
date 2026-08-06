from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import os
import requests
from dotenv import load_dotenv
from typing import Optional, List, Dict
import logging
import traceback
from concurrent.futures import ThreadPoolExecutor, as_completed

from telemetry_replay import (
    build_sparse_replay,
    cache_replay,
    frame_at,
    get_cached_replay,
    load_payload,
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,  # Changed from DEBUG to INFO
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler()  # This ensures logs go to console
    ]
)
logger = logging.getLogger(__name__)

# Load environment variables from backend/.env regardless of process cwd
_BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(_BACKEND_DIR, ".env"))

app = FastAPI()

# Configure CORS (comma-separated list via CORS_ORIGINS)
_cors_origins = [
    origin.strip()
    for origin in os.getenv(
        "CORS_ORIGINS",
        "http://localhost:3000,http://localhost:3001,http://localhost:5000",
    ).split(",")
    if origin.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# PUBG API configuration
PUBG_API_KEY = os.getenv("PUBG_API_KEY")
if not PUBG_API_KEY:
    logger.error("PUBG_API_KEY not found in environment variables")
    raise ValueError("PUBG_API_KEY environment variable is required")
logger.info("PUBG_API_KEY loaded (%s chars)", len(PUBG_API_KEY))

# Map name mapping from API names to in-game names
MAP_NAMES = {
    "Baltic_Main": "Erangel",
    "Chimera_Main": "Paramo",
    "Desert_Main": "Miramar",
    "DihorOtok_Main": "Vikendi",
    "Erangel_Main": "Erangel",
    "Heaven_Main": "Haven",
    "Kiki_Main": "Deston",
    "Range_Main": "Camp Jackal",
    "Savage_Main": "Sanhok",
    "Summerland_Main": "Karakin",
    "Tiger_Main": "Taego",
    "Neon_Main": "Rondo"
}

# Try different shards in order
SHARDS = ["steam", "kakao", "psn", "xbox", "stadia"]


def _find_player(player_name: str, headers: dict):
    """Look up a player across shards. Raises HTTPException on auth/not-found."""
    auth_failed = False
    last_auth_detail = None

    for shard in SHARDS:
        player_url = (
            f"https://api.pubg.com/shards/{shard}/players"
            f"?filter[playerNames]={player_name}"
        )
        logger.info("Trying shard %s: %s", shard, player_url)
        try:
            player_response = requests.get(player_url, headers=headers, timeout=20)
        except requests.exceptions.RequestException as e:
            logger.warning("Request error on shard %s: %s", shard, e)
            continue

        if player_response.status_code in (401, 403):
            auth_failed = True
            last_auth_detail = player_response.text[:300]
            logger.error(
                "PUBG API auth failed on shard %s (%s): %s",
                shard,
                player_response.status_code,
                last_auth_detail,
            )
            continue

        if player_response.status_code == 404:
            logger.info("Player not on shard %s", shard)
            continue

        if not player_response.ok:
            logger.warning(
                "Shard %s returned %s: %s",
                shard,
                player_response.status_code,
                player_response.text[:200],
            )
            continue

        temp_data = player_response.json()
        if temp_data.get("data"):
            player_id = temp_data["data"][0]["id"]
            logger.info("Found player on shard: %s", shard)
            return temp_data, player_id, shard

    if auth_failed:
        raise HTTPException(
            status_code=502,
            detail=(
                "PUBG API rejected the API key (401/403). "
                "Check backend/.env PUBG_API_KEY and restart the backend."
            ),
        )

    logger.warning("Player not found on any shard: %s", player_name)
    raise HTTPException(status_code=404, detail="Player not found on any platform")


class PlayerStats(BaseModel):
    player_name: str
    matches: Optional[List[str]] = None
    stats: Optional[dict] = None

class TelemetryRequest(BaseModel):
    telemetry_url: str
    player_name: Optional[str] = ""

class TelemetryLoadResponse(BaseModel):
    match_id: str
    status: str
    message: str
    elapsed_time: float
    cache_key: str
    map_name: str
    map_scale: float
    kill_count: int
    player_count: int
    tracks: Dict[str, List[dict]]
    kills: List[dict] = []
    debug_info: dict

class FramePlayer(BaseModel):
    name: str
    x: float
    y: float
    z: float
    team_id: Optional[int] = None
    is_dead: bool = False
    is_game: float = 0

class FrameResponse(BaseModel):
    t: float
    players: List[FramePlayer]
    kills_until_t: List[dict]
    map_name: str

@app.get("/")
async def root():
    return {"message": "PubgOps API is running"}

@app.get("/player/{player_name}")
async def get_player_stats(player_name: str):
    try:
        logger.info(f"Fetching stats for player: {player_name}")
        
        # Get player data
        headers = {
            "Authorization": f"Bearer {PUBG_API_KEY}",
            "Accept": "application/vnd.api+json"
        }

        player_data, player_id, correct_shard = _find_player(player_name, headers)
        
        # Get player's lifetime stats
        try:
            lifetime_url = f"https://api.pubg.com/shards/{correct_shard}/players/{player_id}/seasons/lifetime"
            logger.info(f"Requesting lifetime stats from: {lifetime_url}")
            
            lifetime_response = requests.get(lifetime_url, headers=headers)
            lifetime_response.raise_for_status()
            lifetime_data = lifetime_response.json()
            
            # Extract the stats from the lifetime data
            stats = {
                "total_matches": 0,
                "total_kills": 0,
                "total_damage": 0,
                "total_distance": 0,
                "most_kills": 0,
                "match_details": []
            }
            
            # Process the lifetime stats
            if lifetime_data.get("data", {}).get("attributes", {}).get("gameModeStats", {}):
                game_mode_stats = lifetime_data["data"]["attributes"]["gameModeStats"]
                for mode, mode_stats in game_mode_stats.items():
                    stats["total_matches"] += mode_stats.get("roundsPlayed", 0)
                    stats["total_kills"] += mode_stats.get("kills", 0)
                    stats["total_damage"] += mode_stats.get("damageDealt", 0)
                    # Update most kills if this mode has a higher value
                    current_most_kills = mode_stats.get("roundMostKills", 0)
                    if current_most_kills > stats["most_kills"]:
                        stats["most_kills"] = current_most_kills
            
            return {
                "player_name": player_name,
                "platform": correct_shard,
                "stats": stats
            }
            
        except requests.exceptions.RequestException as e:
            logger.error(f"Error fetching lifetime stats: {str(e)}")
            if hasattr(e, 'response') and e.response is not None:
                logger.error(f"Response status: {e.response.status_code}")
                logger.error(f"Response text: {e.response.text}")
            raise HTTPException(
                status_code=500,
                detail=f"Error fetching lifetime stats: {str(e)}"
            )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error: {str(e)}")
        logger.error(traceback.format_exc())
        raise HTTPException(
            status_code=500,
            detail=f"Unexpected error: {str(e)}"
        )
    
@app.get("/player/{player_name}/matches")
async def get_player_matches(player_name: str):
    try:
        logger.info(f"Fetching matches for player: {player_name}")
        
        # Get player data
        headers = {
            "Authorization": f"Bearer {PUBG_API_KEY}",
            "Accept": "application/vnd.api+json"
        }
        
        player_data, player_id, correct_shard = _find_player(player_name, headers)
        
        # Get player's matches  
        try: 
            player_data_url = f"https://api.pubg.com/shards/{correct_shard}/players/{player_id}"
            logger.info(f"Requesting player data from: {player_data_url}")
            
            player_data_response = requests.get(player_data_url, headers=headers)
            player_data_response.raise_for_status()
            player_data = player_data_response.json()

            # Extract match IDs from the player data
            match_ids = [match["id"] for match in player_data["data"]["relationships"]["matches"]["data"]]
            match_limit = 10

            def fetch_match_detail(match_id: str) -> Optional[dict]:
                match_url = f"https://api.pubg.com/shards/{correct_shard}/matches/{match_id}"
                match_response = requests.get(match_url, headers=headers, timeout=30)
                match_response.raise_for_status()
                match_data = match_response.json()

                api_map_name = match_data["data"]["attributes"]["mapName"]
                included = match_data["included"]
                player_win_place = next(
                    (
                        p["attributes"]["stats"]["winPlace"]
                        for p in included
                        if p["type"] == "participant"
                        and p["attributes"]["stats"]["playerId"] == player_id
                    ),
                    None,
                )

                def participant_stat(key: str):
                    return next(
                        (
                            stats["attributes"]["stats"][key]
                            for stats in included
                            if stats["type"] == "participant"
                            and stats["attributes"]["stats"]["playerId"] == player_id
                        ),
                        None,
                    )

                return {
                    "match_id": match_id,
                    "Map": MAP_NAMES.get(api_map_name, api_map_name),
                    "Game Mode": match_data["data"]["attributes"]["gameMode"],
                    "Match Type": match_data["data"]["attributes"]["matchType"],
                    "Duration": participant_stat("timeSurvived"),
                    "Kills": participant_stat("kills"),
                    "Damage": participant_stat("damageDealt"),
                    "Assists": participant_stat("assists"),
                    "Win Place": participant_stat("winPlace"),
                    "Headshots": participant_stat("headshotKills"),
                    "DBNOs": participant_stat("DBNOs"),
                    "Revives": participant_stat("revives"),
                    "Boosts": participant_stat("boosts"),
                    "Heals": participant_stat("heals"),
                    "Longest Kill": participant_stat("longestKill"),
                    "Telemetry_Link": next(
                        (
                            asset["attributes"]["URL"]
                            for asset in included
                            if asset["type"] == "asset"
                        ),
                        None,
                    ),
                    "Teammates": [
                        stats["attributes"]["stats"]["name"]
                        for stats in included
                        if stats["type"] == "participant"
                        and stats["attributes"]["stats"]["winPlace"] == player_win_place
                        and stats["attributes"]["stats"]["name"] != player_name
                    ],
                }

            match_details: List[dict] = []
            ordered_ids = match_ids[:match_limit]
            with ThreadPoolExecutor(max_workers=min(10, max(1, len(ordered_ids)))) as pool:
                future_map = {
                    pool.submit(fetch_match_detail, mid): idx
                    for idx, mid in enumerate(ordered_ids)
                }
                results: List[Optional[dict]] = [None] * len(ordered_ids)
                for future in as_completed(future_map):
                    idx = future_map[future]
                    try:
                        results[idx] = future.result()
                    except Exception as e:
                        logger.error("Failed fetching match %s: %s", ordered_ids[idx], e)
                match_details = [r for r in results if r is not None]

            return match_details
            
        
        except requests.exceptions.RequestException as e:
            logger.error(f"Error fetching matches: {str(e)}")
            raise HTTPException(status_code=500, detail=f"Error fetching matches: {str(e)}")
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error: {str(e)}")
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Unexpected error: {str(e)}")


def _load_or_get_replay(telemetry_url: str):
    cached = get_cached_replay(telemetry_url)
    if cached:
        return cached

    headers = {
        "Accept": "application/vnd.api+json",
        "Accept-Encoding": "gzip, deflate, br",
    }
    telemetry_response = requests.get(telemetry_url, headers=headers, timeout=60)
    telemetry_response.raise_for_status()
    telemetry_data = telemetry_response.json()
    if not isinstance(telemetry_data, list):
        raise ValueError("Unexpected telemetry payload shape")

    replay = build_sparse_replay(telemetry_url, telemetry_data)
    cache_replay(replay)
    return replay


@app.post("/api/match/telemetry", response_model=TelemetryLoadResponse)
async def process_telemetry(request: TelemetryRequest):
    """Fetch telemetry, cache sparse keyframes server-side, return metadata only."""
    try:
        logger.info(
            "Loading telemetry for %s (player=%s)",
            request.telemetry_url,
            request.player_name,
        )
        replay = _load_or_get_replay(request.telemetry_url)
        return load_payload(replay)
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Unexpected error: %s", e)
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Unexpected error: {str(e)}")


@app.get("/api/match/telemetry/frame", response_model=FrameResponse)
async def get_telemetry_frame(
    telemetry_url: str = Query(..., description="Telemetry CDN URL (cache key)"),
    t: float = Query(0, ge=0, description="Elapsed match time in seconds"),
):
    """Interpolate player positions for a single timestamp (server-side)."""
    try:
        replay = get_cached_replay(telemetry_url)
        if not replay:
            # Auto-load if the client skipped / failed to call load
            replay = _load_or_get_replay(telemetry_url)
        return frame_at(replay, t)
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Frame error: %s", e)
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Unexpected error: {str(e)}")

# Add a test endpoint to verify the server is working
@app.get("/test")
async def test_endpoint():
    return {"message": "Server is running"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000) 