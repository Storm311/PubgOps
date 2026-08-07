"""Live integration tests against a running PubgOps stack + PUBG API."""

import os

import httpx
import pytest

BASE_URL = os.getenv("PUBGOPS_BASE_URL", "http://localhost:8000").rstrip("/")
TEST_PLAYER = os.getenv("PUBGOPS_TEST_PLAYER", "shroud")


def _fail_for_pubg_status(response: httpx.Response, context: str) -> None:
    if response.status_code == 401:
        pytest.fail(f"{context}: unauthorized (401) — check PUBG_API_KEY / GitHub API_KEY")
    if response.status_code == 429:
        pytest.fail(f"{context}: rate limited (429) by PUBG API — retry later")
    if response.status_code >= 500:
        detail = response.text[:500]
        pytest.fail(f"{context}: server error {response.status_code}: {detail}")


@pytest.mark.integration
def test_root_via_running_stack():
    with httpx.Client(base_url=BASE_URL, timeout=30.0) as client:
        response = client.get("/")
    assert response.status_code == 200
    assert response.json() == {"message": "PubgOps API is running"}


@pytest.mark.integration
def test_live_player_stats():
    with httpx.Client(base_url=BASE_URL, timeout=60.0) as client:
        response = client.get(f"/player/{TEST_PLAYER}")
    _fail_for_pubg_status(response, f"GET /player/{TEST_PLAYER}")
    assert response.status_code == 200, response.text
    data = response.json()
    assert data.get("player_name") == TEST_PLAYER
    assert "platform" in data
    assert "stats" in data
    assert isinstance(data["stats"], dict)
    assert "total_matches" in data["stats"]


@pytest.mark.integration
def test_live_player_matches():
    with httpx.Client(base_url=BASE_URL, timeout=90.0) as client:
        response = client.get(f"/player/{TEST_PLAYER}/matches")
    _fail_for_pubg_status(response, f"GET /player/{TEST_PLAYER}/matches")
    assert response.status_code == 200, response.text
    data = response.json()
    assert isinstance(data, list)
    if data:
        match = data[0]
        assert "match_id" in match
        assert "Map" in match or "Kills" in match
