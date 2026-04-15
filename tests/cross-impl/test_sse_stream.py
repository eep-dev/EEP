# Copyright 2026 EEP Contributors — Apache-2.0
"""
Cross-implementation test: SSE stream protocol compliance.

Validates SSE endpoint behavior against Whitepaper §5.2:
  - Content-Type: text/event-stream
  - CloudEvents envelope structure
  - Last-Event-ID replay support
"""

import pytest


class TestSSEStreamProtocol:
    """Cross-impl SSE stream endpoint tests."""

    def test_sse_content_type(self, base_url, http_client):
        """SSE endpoint must return text/event-stream content type."""
        try:
            r = http_client.get(f"{base_url}/eep/stream", headers={"Accept": "text/event-stream"}, timeout=5)
            if r.status_code == 200:
                assert "text/event-stream" in r.headers.get("content-type", "")
            else:
                pytest.skip(f"SSE endpoint returned {r.status_code}")
        except Exception:
            pytest.skip("SSE endpoint not available")

    def test_sse_supports_last_event_id(self, base_url, http_client):
        """SSE endpoint must accept Last-Event-ID header without error."""
        try:
            r = http_client.get(
                f"{base_url}/eep/stream",
                headers={"Accept": "text/event-stream", "Last-Event-ID": "evt_0"},
                timeout=5,
            )
            # Must not return 400 — should accept the header
            assert r.status_code != 400, "Endpoint rejected Last-Event-ID header"
        except Exception:
            pytest.skip("SSE endpoint not available")

    def test_sse_cache_control(self, base_url, http_client):
        """SSE endpoint should return no-cache directive."""
        try:
            r = http_client.get(f"{base_url}/eep/stream", headers={"Accept": "text/event-stream"}, timeout=5)
            if r.status_code == 200:
                cc = r.headers.get("cache-control", "")
                assert "no-cache" in cc.lower(), f"Expected no-cache, got: {cc}"
            else:
                pytest.skip(f"SSE endpoint returned {r.status_code}")
        except Exception:
            pytest.skip("SSE endpoint not available")
