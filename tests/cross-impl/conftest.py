# Copyright 2026 EEP Contributors — Apache-2.0
"""
Cross-implementation EEP test fixtures.

These tests are language-agnostic — they run against any HTTP server
that implements the EEP gate publisher endpoints.

Configure via EEP_BASE_URL environment variable.
"""

import os
import pytest
import httpx

BASE_URL = os.environ.get("EEP_BASE_URL", "http://localhost:3002")
TEST_DID = "did:web:example.com:u:test-entity"


@pytest.fixture(scope="session")
def base_url() -> str:
    return BASE_URL


@pytest.fixture(scope="session")
def client() -> httpx.Client:
    with httpx.Client(base_url=BASE_URL, timeout=10.0) as c:
        yield c


@pytest.fixture(scope="session")
def http_client(client: httpx.Client) -> httpx.Client:
    """Backward-compatible alias used by SSE protocol tests."""
    return client


@pytest.fixture
def test_did() -> str:
    return TEST_DID
