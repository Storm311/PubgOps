import os

from dotenv import load_dotenv

# Must run before any test module imports main (which requires PUBG_API_KEY at import time).
load_dotenv()
if not os.getenv("PUBG_API_KEY"):
    os.environ["PUBG_API_KEY"] = "test_api_key"

import pytest  # noqa: E402


@pytest.fixture(autouse=True)
def setup_test_environment():
    """Ensure a dummy key exists for offline unit tests."""
    if not os.getenv("PUBG_API_KEY"):
        os.environ["PUBG_API_KEY"] = "test_api_key"
    yield
