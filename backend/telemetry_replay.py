"""Sparse telemetry processing and on-demand frame interpolation."""

from __future__ import annotations

import logging
from bisect import bisect_right
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

# World sizes in PUBG coordinate units (approx. map edge length).
DEFAULT_MAP_SCALE = 816000.0

MAP_SCALES: Dict[str, float] = {
    # Friendly names
    "Erangel": 816000.0,
    "Miramar": 816000.0,
    "Taego": 816000.0,
    "Deston": 816000.0,
    "Rondo": 816000.0,
    "Vikendi": 612000.0,
    "Sanhok": 408000.0,
    "Paramo": 306000.0,
    "Karakin": 204000.0,
    "Haven": 102000.0,
    "Camp Jackal": 816000.0,
    # API map ids
    "Baltic_Main": 816000.0,
    "Erangel_Main": 816000.0,
    "Desert_Main": 816000.0,
    "Tiger_Main": 816000.0,
    "Kiki_Main": 816000.0,
    "Neon_Main": 816000.0,
    "DihorOtok_Main": 612000.0,
    "Savage_Main": 408000.0,
    "Chimera_Main": 306000.0,
    "Summerland_Main": 204000.0,
    "Heaven_Main": 102000.0,
    "Range_Main": 816000.0,
}

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
    "Neon_Main": "Rondo",
}


@dataclass
class Location:
    x: float
    y: float
    z: float

    def to_dict(self) -> Dict[str, float]:
        return {"x": self.x, "y": self.y, "z": self.z}


@dataclass
class Keyframe:
    elapsed_time: float
    location: Location
    is_game: float
    team_id: Optional[int] = None
    is_dead: bool = False


@dataclass
class KillEvent:
    victim_name: str
    killer_name: Optional[str]
    elapsed_time: float
    victim_location: Location
    killer_location: Optional[Location]
    is_suicide: bool = False

    def to_dict(self) -> Dict[str, Any]:
        return {
            "victim_name": self.victim_name,
            "killer_name": self.killer_name,
            "elapsed_time": self.elapsed_time,
            "victim_location": self.victim_location.to_dict(),
            "killer_location": self.killer_location.to_dict() if self.killer_location else None,
            "is_suicide": self.is_suicide,
        }


@dataclass
class ProcessedReplay:
    match_id: str
    telemetry_url: str
    elapsed_time: float
    map_name: str
    map_scale: float
    player_tracks: Dict[str, List[Keyframe]] = field(default_factory=dict)
    kill_events: List[KillEvent] = field(default_factory=list)
    # Parallel time index per player for bisect
    player_times: Dict[str, List[float]] = field(default_factory=dict)

    def finalize(self) -> None:
        for name, frames in self.player_tracks.items():
            frames.sort(key=lambda f: f.elapsed_time)
            self.player_times[name] = [f.elapsed_time for f in frames]


# In-process cache keyed by telemetry URL
_telemetry_cache: Dict[str, ProcessedReplay] = {}


def get_cached_replay(telemetry_url: str) -> Optional[ProcessedReplay]:
    return _telemetry_cache.get(telemetry_url)


def cache_replay(replay: ProcessedReplay) -> None:
    _telemetry_cache[replay.telemetry_url] = replay


def clear_cache() -> None:
    _telemetry_cache.clear()


def resolve_map_scale(map_name: str) -> float:
    if not map_name:
        return DEFAULT_MAP_SCALE
    if map_name in MAP_SCALES:
        return MAP_SCALES[map_name]
    friendly = MAP_NAMES.get(map_name)
    if friendly and friendly in MAP_SCALES:
        return MAP_SCALES[friendly]
    return DEFAULT_MAP_SCALE


def normalize_location(raw: Dict[str, float], scale: float) -> Location:
    return Location(
        x=round((raw["x"] / scale) * 1000, 3),
        y=round((raw["y"] / scale) * 1000, 3),
        z=round((raw["z"] / scale) * 1000, 3),
    )


def _parse_iso(ts: str) -> datetime:
    return datetime.fromisoformat(ts.replace("Z", "+00:00"))


def _extract_map_name(telemetry_data: List[dict]) -> str:
    for event in telemetry_data:
        if event.get("_T") == "LogMatchStart":
            api_map = event.get("mapName") or event.get("map_name")
            if api_map:
                return MAP_NAMES.get(api_map, api_map)
        # Some dumps put map on MatchDefinition
        if event.get("_T") == "LogMatchDefinition":
            attrs = event.get("MatchId")  # noop keep scanning
            _ = attrs
    return "Erangel"


def _match_id_from_url(telemetry_url: str) -> str:
    leaf = telemetry_url.rstrip("/").split("/")[-1]
    return leaf.replace("-telemetry.json", "").replace("-telemetry.js", "").replace(".json", "")


def _nearest_elapsed(telemetry_data: List[dict], target: datetime) -> float:
    closest = 0.0
    min_diff = float("inf")
    for other in telemetry_data:
        if "elapsedTime" not in other or "_D" not in other:
            continue
        other_time = _parse_iso(other["_D"])
        diff = abs((other_time - target).total_seconds())
        if diff < min_diff:
            min_diff = diff
            closest = float(other["elapsedTime"])
    return closest


def build_sparse_replay(telemetry_url: str, telemetry_data: List[dict]) -> ProcessedReplay:
    map_name = _extract_map_name(telemetry_data)
    map_scale = resolve_map_scale(map_name)

    elapsed_time = 0.0
    for event in reversed(telemetry_data):
        if "elapsedTime" in event:
            elapsed_time = float(event["elapsedTime"])
            break

    replay = ProcessedReplay(
        match_id=_match_id_from_url(telemetry_url),
        telemetry_url=telemetry_url,
        elapsed_time=elapsed_time,
        map_name=map_name,
        map_scale=map_scale,
    )

    kill_events_by_d: Dict[str, dict] = {}
    for event in telemetry_data:
        if event.get("_T") == "LogPlayerKillV2" and "_D" in event:
            kill_events_by_d[event["_D"]] = event

    for kill_event in kill_events_by_d.values():
        victim = kill_event.get("victim")
        killer = kill_event.get("killer")
        if not victim:
            continue
        victim_loc = victim.get("location")
        if not victim_loc:
            continue
        try:
            victim_location = normalize_location(victim_loc, map_scale)
            killer_location = None
            if killer and killer.get("location"):
                killer_location = normalize_location(killer["location"], map_scale)
            kill_time = _parse_iso(kill_event["_D"])
            closest_elapsed = _nearest_elapsed(telemetry_data, kill_time)
            replay.kill_events.append(
                KillEvent(
                    victim_name=victim.get("name", "Unknown"),
                    killer_name=killer.get("name") if killer else None,
                    elapsed_time=closest_elapsed,
                    victim_location=victim_location,
                    killer_location=killer_location,
                    is_suicide=bool(kill_event.get("isSuicide", False)),
                )
            )
        except Exception as e:
            logger.error("Error processing kill event: %s", e)
            continue

    replay.kill_events.sort(key=lambda k: k.elapsed_time)

    dead_players: set = set()
    # Pre-index kill times by victim for death marking
    victim_kill_times: Dict[str, List[datetime]] = {}
    for kd, ke in kill_events_by_d.items():
        victim = ke.get("victim") or {}
        name = victim.get("name")
        if name:
            victim_kill_times.setdefault(name, []).append(_parse_iso(kd))

    for event in telemetry_data:
        if "elapsedTime" not in event or event["elapsedTime"] <= 0:
            continue
        if "common" not in event or event["common"].get("isGame", 0) < 0.09:
            continue

        character = None
        event_type = event.get("_T")

        if event_type == "LogPlayerPosition" and "character" in event:
            character = event["character"]
        elif event_type == "LogBlackZoneEnded" and "survivors" in event:
            for survivor in event["survivors"]:
                if survivor.get("type") == "user":
                    character = survivor
                    break
        elif event_type in ["LogHeal", "LogItemAttach", "LogItemEquip", "LogItemUse"]:
            if "character" in event:
                character = event["character"]
        elif event_type == "LogPlayerCreate" and "character" in event:
            character = event["character"]
            if character.get("name") in dead_players:
                dead_players.discard(character.get("name"))

        if not character:
            continue
        if "type" in character and character["type"] != "user":
            continue
        if "name" not in character or "location" not in character:
            continue
        location = character["location"]
        if not all(k in location for k in ("x", "y", "z")):
            continue

        player_name = character["name"]
        is_dead = player_name in dead_players
        if not is_dead and player_name in victim_kill_times and "_D" in event:
            event_time = _parse_iso(event["_D"])
            for kill_time in victim_kill_times[player_name]:
                if event_time >= kill_time:
                    dead_players.add(player_name)
                    is_dead = True
                    break

        keyframe = Keyframe(
            elapsed_time=float(event["elapsedTime"]),
            location=normalize_location(location, map_scale),
            is_game=float(event["common"].get("isGame", 0)),
            team_id=character.get("teamId"),
            is_dead=is_dead,
        )
        replay.player_tracks.setdefault(player_name, []).append(keyframe)

    replay.finalize()
    return replay


def _lerp(a: float, b: float, t: float) -> float:
    return a + (b - a) * t


def _position_at(frames: List[Keyframe], times: List[float], t: float) -> Optional[Dict[str, Any]]:
    if not frames:
        return None
    if t <= times[0]:
        f = frames[0]
        return {
            "name": None,  # filled by caller
            "x": f.location.x,
            "y": f.location.y,
            "z": f.location.z,
            "team_id": f.team_id,
            "is_dead": f.is_dead,
            "is_game": f.is_game,
        }
    if t >= times[-1]:
        f = frames[-1]
        return {
            "name": None,
            "x": f.location.x,
            "y": f.location.y,
            "z": f.location.z,
            "team_id": f.team_id,
            "is_dead": f.is_dead,
            "is_game": f.is_game,
        }

    idx = bisect_right(times, t)
    prev_f = frames[idx - 1]
    next_f = frames[idx]
    span = next_f.elapsed_time - prev_f.elapsed_time
    u = 0.0 if span <= 0 else (t - prev_f.elapsed_time) / span
    return {
        "name": None,
        "x": round(_lerp(prev_f.location.x, next_f.location.x, u), 3),
        "y": round(_lerp(prev_f.location.y, next_f.location.y, u), 3),
        "z": round(_lerp(prev_f.location.z, next_f.location.z, u), 3),
        "team_id": prev_f.team_id,
        "is_dead": prev_f.is_dead or next_f.is_dead,
        "is_game": _lerp(prev_f.is_game, next_f.is_game, u),
    }


def frame_at(replay: ProcessedReplay, t: float) -> Dict[str, Any]:
    t = max(0.0, min(float(t), replay.elapsed_time))
    players: List[Dict[str, Any]] = []
    for name, frames in replay.player_tracks.items():
        times = replay.player_times[name]
        pos = _position_at(frames, times, t)
        if not pos:
            continue
        # Skip players who haven't appeared yet
        if t < times[0]:
            continue
        pos["name"] = name
        players.append(pos)

    kills_until = [k.to_dict() for k in replay.kill_events if k.elapsed_time <= t]
    return {
        "t": t,
        "players": players,
        "kills_until_t": kills_until,
        "map_name": replay.map_name,
    }


def load_payload(replay: ProcessedReplay) -> Dict[str, Any]:
    """Metadata + compact sparse tracks for one-shot client download (local scrubbing)."""
    total_keyframes = sum(len(v) for v in replay.player_tracks.values())
    tracks: Dict[str, List[Dict[str, Any]]] = {}
    for name, frames in replay.player_tracks.items():
        # Compact tuples: t, x, y, z, team_id, is_dead
        tracks[name] = [
            {
                "t": round(f.elapsed_time, 2),
                "x": f.location.x,
                "y": f.location.y,
                "z": f.location.z,
                "team_id": f.team_id,
                "is_dead": f.is_dead,
            }
            for f in frames
        ]

    return {
        "match_id": replay.match_id,
        "status": "success",
        "message": "Match telemetry loaded (sparse keyframes; scrub locally)",
        "elapsed_time": replay.elapsed_time,
        "cache_key": replay.telemetry_url,
        "map_name": replay.map_name,
        "map_scale": replay.map_scale,
        "kill_count": len(replay.kill_events),
        "player_count": len(replay.player_tracks),
        "tracks": tracks,
        "kills": [k.to_dict() for k in replay.kill_events],
        "debug_info": {
            "player_name_tracks": len(replay.player_tracks),
            "total_keyframes": total_keyframes,
            "total_kills": len(replay.kill_events),
            "map_name": replay.map_name,
            "map_scale": replay.map_scale,
        },
    }


# Back-compat alias
def load_metadata(replay: ProcessedReplay) -> Dict[str, Any]:
    return load_payload(replay)
