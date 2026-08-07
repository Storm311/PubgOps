import os
import sys

import pytest
from fastapi.testclient import TestClient

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import gzip
import json

from main import app
from telemetry_replay import build_sparse_replay, cache_replay, clear_cache, frame_at

client = TestClient(app)


@pytest.fixture(autouse=True)
def _clear_replay_cache():
    clear_cache()
    yield
    clear_cache()


@pytest.mark.api
def test_root_endpoint_returns_correct_message():
    response = client.get("/")
    assert response.status_code == 200
    assert response.json() == {"message": "PubgOps API is running"}


@pytest.mark.api
def test_telemetry_endpoint_handles_invalid_url():
    response = client.post(
        "/api/match/telemetry",
        json={"telemetry_url": "invalid_url", "player_name": "test"},
    )
    assert response.status_code == 500


@pytest.mark.api
def test_telemetry_endpoint_handles_missing_url():
    response = client.post("/api/match/telemetry", json={})
    assert response.status_code == 422


@pytest.fixture
def sample_telemetry_data():
    return [
        {
            "_T": "LogMatchStart",
            "_D": "2025-05-03T23:00:00.000Z",
            "mapName": "Baltic_Main",
        },
        {
            "_T": "LogPlayerPosition",
            "_D": "2025-05-03T23:00:10.000Z",
            "elapsedTime": 10,
            "common": {"isGame": 1.0},
            "character": {
                "name": "Rinneus",
                "teamId": 12,
                "type": "user",
                "location": {"x": 408000, "y": 408000, "z": 0},
            },
        },
        {
            "_T": "LogPlayerPosition",
            "_D": "2025-05-03T23:00:20.000Z",
            "elapsedTime": 20,
            "common": {"isGame": 1.0},
            "character": {
                "name": "Rinneus",
                "teamId": 12,
                "type": "user",
                "location": {"x": 500000, "y": 400000, "z": 0},
            },
        },
        {
            "_T": "LogGameStatePeriodic",
            "_D": "2025-05-03T23:10:55.908Z",
            "elapsedTime": 1476,
            "common": {"isGame": 1.0},
        },
    ]


@pytest.mark.api
def test_telemetry_endpoint_processes_valid_data(sample_telemetry_data, monkeypatch):
    def mock_get(*args, **kwargs):
        class MockResponse:
            def __init__(self, json_data):
                self.json_data = json_data
                json_str = json.dumps(json_data)
                self.content = gzip.compress(json_str.encode("utf-8"))
                self.headers = {"Content-Encoding": "gzip"}

            def json(self):
                return self.json_data

            def raise_for_status(self):
                pass

        return MockResponse(sample_telemetry_data)

    monkeypatch.setattr("requests.get", mock_get)
    monkeypatch.setattr("main.requests.get", mock_get)

    url = (
        "https://telemetry-cdn.pubg.com/bluehole-pubg/steam/2025/05/03/23/11/"
        "eadb58ca-2873-11f0-912d-5ac6b73d44a2-telemetry.json"
    )
    response = client.post(
        "/api/match/telemetry",
        json={"telemetry_url": url, "player_name": "Rinneus"},
    )

    assert response.status_code == 200
    data = response.json()
    assert "match_id" in data
    assert data["elapsed_time"] == 1476
    assert data["status"] == "success"
    assert data["cache_key"] == url
    assert "interpolated_positions_by_time" not in data
    assert "player_positions_by_time" not in data
    assert "tracks" in data
    assert "Rinneus" in data["tracks"]
    assert len(data["tracks"]["Rinneus"]) >= 2
    assert data["player_count"] >= 1
    assert data["map_name"] == "Erangel"
    assert data["map_scale"] == 816000.0


@pytest.mark.api
def test_frame_endpoint_interpolates(sample_telemetry_data):
    url = "https://example.com/test-telemetry.json"
    replay = build_sparse_replay(url, sample_telemetry_data)
    cache_replay(replay)

    response = client.get(
        "/api/match/telemetry/frame",
        params={"telemetry_url": url, "t": 15},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["t"] == 15
    assert len(data["players"]) == 1
    player = data["players"][0]
    assert player["name"] == "Rinneus"
    # Midpoint between x 408000->500000 => ~500–612 on 0–1000 scale
    assert 500 < player["x"] < 650
    assert player["team_id"] == 12


@pytest.mark.api
def test_map_scale_sanhok():
    data = [
        {"_T": "LogMatchStart", "_D": "2025-01-01T00:00:00Z", "mapName": "Savage_Main"},
        {
            "_T": "LogPlayerPosition",
            "_D": "2025-01-01T00:00:05Z",
            "elapsedTime": 5,
            "common": {"isGame": 1.0},
            "character": {
                "name": "A",
                "teamId": 1,
                "type": "user",
                "location": {"x": 204000, "y": 204000, "z": 0},
            },
        },
    ]
    replay = build_sparse_replay("https://example.com/sanhok.json", data)
    assert replay.map_name == "Sanhok"
    assert replay.map_scale == 408000.0
    frame = frame_at(replay, 5)
    # half of Sanhok map => ~500
    assert abs(frame["players"][0]["x"] - 500) < 1
