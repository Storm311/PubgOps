import pytest
import os
from dotenv import load_dotenv

@pytest.fixture(autouse=True)
def setup_test_environment():
    """Setup test environment variables"""
    # Load test environment variables
    load_dotenv()
    
    # Set test API key if not present
    if not os.getenv("PUBG_API_KEY"):
        os.environ["PUBG_API_KEY"] = "test_api_key"
    
    yield
    
    # Cleanup after tests if needed
    pass 