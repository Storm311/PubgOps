import os
import sys

import pytest

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from player_state import build_player_states  # noqa: E402
from telemetry_clock import TelemetryClock  # noqa: E402
from telemetry_replay import build_sparse_replay, load_payload  # noqa: E402


def _ts(t):
    return f"2025-01-01T00:{int(t) // 60:02d}:{t % 60:06.3f}Z"


def _char(name, x=100000, health=100, team=1):
    return {
        "name": name,
        "teamId": team,
        "health": health,
        "type": "user",
        "location": {"x": x, "y": 100000, "z": 0},
    }


def _pos(t, name, x=100000):
    return {
        "_T": "LogPlayerPosition",
        "_D": _ts(t),
        "elapsedTime": t,
        "common": {"isGame": 1},
        "character": _char(name, x),
    }


def _ev(kind, t, **fields):
    return {"_T": kind, "_D": _ts(t), "common": {"isGame": 1}, **fields}


def _item(item_id, category, sub, stack=1):
    return {"itemId": item_id, "category": category, "subCategory": sub, "stackCount": stack}


def _game_state(t, start):
    return {
        "_T": "LogGameStatePeriodic",
        "_D": _ts(t),
        "common": {"isGame": 1},
        "gameState": {"elapsedTime": t, "numStartPlayers": start, "numAlivePlayers": start},
    }


@pytest.fixture
def respawn_match():
    """A is knocked + revived, dies, gets recalled by a teammate, then dies again."""
    return [
        {"_T": "LogMatchStart", "_D": _ts(0), "mapName": "Baltic_Main"},
        _game_state(1, 3),
        _pos(5, "A"),
        _pos(5, "B"),
        _ev("LogPlayerMakeGroggy", 10, victim=_char("A", health=0)),
        _ev("LogPlayerRevive", 15, victim=_char("A", health=10)),
        _pos(18, "A", x=110000),
        _ev("LogPlayerKillV2", 20, victim=_char("A", x=120000, health=0)),
        _pos(30, "B"),
        _ev("LogPlayerCreate", 40, character=_char("A", x=400000)),
        _pos(45, "A", x=410000),
        _ev("LogPlayerKillV2", 50, victim=_char("A", x=420000, health=0)),
        _ev("LogPlayerKillV2", 55, victim=_char("C", health=0)),
        _pos(60, "B"),
    ]


@pytest.mark.api
def test_life_cycle_handles_revive_respawn_and_second_death(respawn_match):
    states = build_player_states(respawn_match, TelemetryClock(respawn_match))
    assert [s for _, s in states.players["A"].life] == [
        "knocked",
        "alive",
        "dead",
        "alive",
        "dead",
    ]
    assert states.life_at("A", 25) == "dead"
    assert states.life_at("A", 45) == "alive"
    assert states.life_at("A", 51) == "dead"


@pytest.mark.api
def test_alive_count_drops_on_death_and_rises_on_respawn(respawn_match):
    states = build_player_states(respawn_match, TelemetryClock(respawn_match))
    assert [n for _, n in states.alive_counts] == [3, 2, 3, 2, 1]


@pytest.mark.api
def test_dead_body_holds_position_until_respawn(respawn_match):
    replay = build_sparse_replay("https://example.com/r.json", respawn_match)
    frames = [(f.elapsed_time, f.location.x, f.is_dead) for f in replay.player_tracks["A"]]
    # Death keyframe at the kill location, marked dead; earlier frames alive.
    assert (20, pytest.approx(120000 / 816000 * 1000, abs=0.01), True) in frames
    assert all(not dead for t, _, dead in frames if t < 20)
    # Alive again after the respawn (not stuck dead from the first kill).
    assert (45, pytest.approx(410000 / 816000 * 1000, abs=0.01), False) in frames


@pytest.mark.api
def test_payload_has_life_alive_counts_and_focus_player(respawn_match):
    payload = load_payload(build_sparse_replay("https://example.com/r.json", respawn_match), "a")
    assert [s for _, s in payload["life"]["A"]][-2:] == ["alive", "dead"]
    assert payload["alive_counts"][0] == [0.0, 3]
    assert payload["focus_name"] == "A"
    assert payload["player_state"]["life"] == payload["life"]["A"]
    assert load_payload(build_sparse_replay("x", respawn_match), "nobody")["player_state"] is None


@pytest.mark.api
def test_loadout_tracks_guns_armor_and_throwables():
    a = _char("A")
    events = [
        _pos(1, "A"),
        _ev("LogItemEquip", 2, character=a, item=_item("Item_Weapon_HK416_C", "Weapon", "Main")),
        _ev("LogItemEquip", 3, character=a, item=_item("Item_Weapon_G18_C", "Weapon", "Handgun")),
        _ev("LogItemEquip", 4, character=a, item=_item("Item_Weapon_AK47_C", "Weapon", "Main")),
        _ev(
            "LogItemEquip", 5, character=a, item=_item("Item_Armor_D_01_Lv2_C", "Equipment", "Vest")
        ),
        _ev(
            "LogItemEquip",
            6,
            character=a,
            item=_item("Item_Head_G_01_Lv3_C", "Equipment", "Headgear"),
        ),
        _ev(
            "LogItemEquip",
            7,
            character=a,
            item=_item("Item_Back_C_02_Lv3_C", "Equipment", "Backpack"),
        ),
        _ev(
            "LogItemPickup",
            8,
            character=a,
            item=_item("Item_Weapon_Grenade_C", "Equipment", "Throwable", 2),
        ),
        _ev(
            "LogPlayerUseThrowable",
            9,
            attacker=a,
            weapon={"itemId": "Item_Weapon_Grenade_C"},
        ),
        _ev("LogItemUnequip", 10, character=a, item=_item("Item_Weapon_AK47_C", "Weapon", "Main")),
        # Temporary parachute pack must not replace the backpack.
        _ev(
            "LogItemEquip",
            11,
            character=a,
            item=_item("Item_Back_B_01_StartParachutePack_C", "Equipment", "Backpack"),
        ),
        _ev(
            "LogArmorDestroy",
            12,
            victim=a,
            item=_item("Item_Armor_D_01_Lv2_C", "Equipment", "Vest"),
        ),
    ]
    gear = build_player_states(events, TelemetryClock(events)).players["A"].gear

    after_pickups = dict(gear)[8]
    assert [g["name"] for g in after_pickups["guns"]] == ["HK416", "AK47", "G18"]
    assert (after_pickups["helmet"], after_pickups["vest"], after_pickups["backpack"]) == (3, 2, 3)
    assert after_pickups["throwables"] == {"Grenade": 2}

    final = gear[-1][1]
    assert [g["name"] for g in final["guns"]] == ["HK416", "G18"]
    assert final["throwables"] == {"Grenade": 1}
    assert (final["vest"], final["backpack"]) == (None, 3)


@pytest.mark.api
def test_same_instant_kills_each_count_and_rejoin_keeps_gear():
    a = _char("A")
    events = [
        _game_state(1, 3),
        _pos(2, "A"),
        _ev("LogItemEquip", 3, character=a, item=_item("Item_Weapon_HK416_C", "Weapon", "Main")),
        # Rejoin while alive: in-game LogPlayerCreate must not wipe the loadout.
        _ev("LogPlayerCreate", 4, character=a),
        # One grenade, two victims, same timestamp.
        _ev("LogPlayerKillV2", 5, victim=_char("B")),
        _ev("LogPlayerKillV2", 5, victim=_char("C")),
    ]
    replay = build_sparse_replay("https://example.com/k.json", events)
    assert sorted(k.victim_name for k in replay.kill_events) == ["B", "C"]
    assert [n for _, n in replay.states.alive_counts] == [3, 2, 1]
    assert replay.states.players["A"].gear[-1][1]["guns"] == [{"name": "HK416", "slot": "Main"}]


@pytest.mark.api
def test_clock_maps_wall_time_onto_elapsed_with_drift():
    """Elapsed lags wall clock by 5 s at the end; events between are interpolated."""
    events = [
        {"_T": "LogPlayerPosition", "_D": _ts(10), "elapsedTime": 10},
        {"_T": "LogPlayerPosition", "_D": _ts(110), "elapsedTime": 105},
    ]
    clock = TelemetryClock(events)
    assert clock.of({"_D": _ts(60)}) == pytest.approx(57.5)
    assert clock.of({"_D": _ts(60), "elapsedTime": 70}) == 70


@pytest.mark.api
def test_combat_counts_enemy_damage_kills_and_knocks_and_lists_teammates():
    a, mate, enemy = _char("A", team=1), _char("M", team=1), _char("E", team=2)
    events = [
        _pos(1, "A"),
        _pos(1, "M"),
        _pos(1, "E"),
        _ev("LogPlayerTakeDamage", 2, attacker=a, victim=enemy, damage=40.5),
        _ev("LogPlayerTakeDamage", 3, attacker=a, victim=mate, damage=99),  # team damage
        _ev("LogPlayerMakeGroggy", 4, attacker=a, victim=enemy),
        _ev("LogPlayerKillV2", 5, killer=a, finisher=mate, victim=enemy),
        _ev("LogPlayerKillV2", 6, killer=a, victim=mate),  # team kill
    ]
    replay = build_sparse_replay("https://example.com/c.json", events)
    payload = load_payload(replay, "A")
    assert payload["player_state"]["combat"][-1][1] == {"damage": 40.5, "kills": 1, "knocks": 1}
    assert [m["name"] for m in payload["teammates"]] == ["M"]
    assert payload["teammates"][0]["combat"] == []
