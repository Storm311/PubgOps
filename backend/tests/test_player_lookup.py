import os
import sys
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from main import app

client = TestClient(app)


def _shards_return(monkeypatch, status):
    resp = SimpleNamespace(status_code=status, ok=False, text="")
    monkeypatch.setattr("main.requests.get", lambda *a, **k: resp)


@pytest.mark.api
def test_rate_limited_lookup_is_429_not_404(monkeypatch):
    _shards_return(monkeypatch, 429)
    r = client.get("/player/shroud")
    assert r.status_code == 429
    assert "rate limit" in r.json()["detail"].lower()


@pytest.mark.api
def test_missing_player_is_still_404(monkeypatch):
    _shards_return(monkeypatch, 404)
    r = client.get("/player/nobody")
    assert r.status_code == 404
