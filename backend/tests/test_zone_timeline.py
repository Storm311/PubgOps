import json
import os
import sys

import pytest

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from telemetry_replay import build_sparse_replay, load_payload  # noqa: E402
from zone_timeline import build_zone_timeline  # noqa: E402

FIXTURE = os.path.join(os.path.dirname(__file__), "fixtures", "zone_sanhok.json")


@pytest.fixture(scope="module")
def sanhok_telemetry():
    """Zone-related events from a real Sanhok squad match (player lists stripped)."""
    with open(FIXTURE, encoding="utf-8") as f:
        return json.load(f)


def _state(t, blue, white=(0, 0, 0), is_game=1.0, red=(0, 0, 0)):
    return {
        "_T": "LogGameStatePeriodic",
        "common": {"isGame": is_game},
        "gameState": {
            "elapsedTime": t,
            "safetyZonePosition": {"x": blue[0], "y": blue[1], "z": 0},
            "safetyZoneRadius": blue[2],
            "poisonGasWarningPosition": {"x": white[0], "y": white[1], "z": 0},
            "poisonGasWarningRadius": white[2],
            "redZonePosition": {"x": red[0], "y": red[1], "z": 0},
            "redZoneRadius": red[2],
        },
    }


@pytest.mark.api
def test_real_match_phases_are_sequential(sanhok_telemetry):
    """Each phase's white circle appears when the previous shrink ends, and shrinks inward."""
    tl = build_zone_timeline(sanhok_telemetry)
    assert tl is not None
    assert len(tl.phases) == 7
    assert tl.initial.r == pytest.approx(293499.56, abs=1)

    for prev, cur in zip(tl.phases, tl.phases[1:]):
        assert cur.appear_t == prev.shrink_end_t
        assert cur.white.r < prev.white.r
    for p in tl.phases[:-1]:
        assert p.appear_t <= p.shrink_start_t < p.shrink_end_t


@pytest.mark.api
def test_real_match_shrink_timing_is_recovered(sanhok_telemetry):
    """Fitted shrink windows match the game's round-number timers despite 10 s sampling."""
    phases = build_zone_timeline(sanhok_telemetry).phases
    shrink = [p.shrink_end_t - p.shrink_start_t for p in phases[1:6]]
    assert shrink == pytest.approx([120, 120, 120, 60, 60], abs=1.5)
    wait = [p.shrink_start_t - p.appear_t for p in phases[1:6]]
    assert wait == pytest.approx([120, 90, 60, 45, 45], abs=1.5)
    # Match ended while phase 7 was still waiting.
    assert phases[-1].shrink_start_t is None


@pytest.mark.api
def test_real_match_zone_damage_ramps_up(sanhok_telemetry):
    dps = [p.dps for p in build_zone_timeline(sanhok_telemetry).phases]
    assert dps[0] == pytest.approx(0.4, abs=0.01)
    assert dps == sorted(dps)


@pytest.mark.api
def test_shrink_interpolates_exactly_between_sparse_samples():
    """Blue shrinks 1000→500 over t=100..200; samples every 30 s still recover the window."""
    blue0, white = (0, 0, 1000), (100, 0, 500)
    events = [_state(t, blue0, white) for t in (40, 70, 100)]
    for t in (130, 160, 190):
        u = (t - 100) / 100
        events.append(_state(t, (100 * u, 0, 1000 - 500 * u), white, is_game=1.5))
    events.append(_state(220, white, (50, 0, 250), is_game=2.0))

    tl = build_zone_timeline(events)
    first = tl.phases[0]
    assert first.shrink_start_t == pytest.approx(100)
    assert first.shrink_end_t == pytest.approx(200)
    assert tl.phases[1].appear_t == pytest.approx(200)


@pytest.mark.api
def test_red_zone_spans_samples():
    blue, white = (0, 0, 1000), (0, 0, 500)
    events = [
        _state(10, blue, white),
        _state(20, blue, white, red=(300, 300, 50)),
        _state(30, blue, white, red=(300, 300, 50)),
        _state(40, blue, white),
    ]
    zones = build_zone_timeline(events).red_zones
    assert len(zones) == 1
    assert (zones[0].start_t, zones[0].end_t) == (20, 40)


@pytest.mark.api
def test_no_zone_data_returns_none():
    assert build_zone_timeline([{"_T": "LogGameStatePeriodic", "elapsedTime": 5}]) is None
    assert build_zone_timeline([_state(10, (0, 0, 1000))]) is None


@pytest.mark.api
def test_payload_includes_normalized_zone(sanhok_telemetry):
    """Zone circles share the 0–1000 map space with player tracks (Sanhok = 408000)."""
    replay = build_sparse_replay("https://example.com/sanhok.json", sanhok_telemetry)
    zone = load_payload(replay)["zone"]
    assert zone["initial"] == {"x": 500.0, "y": 500.0, "r": pytest.approx(719.36, abs=0.01)}
    assert len(zone["phases"]) == 7
    assert 0 < zone["phases"][0]["white"]["r"] < 1000
    assert zone["red_zones"] == []
