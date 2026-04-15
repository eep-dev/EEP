# Copyright 2026 EEP Contributors — Apache-2.0
"""Tests for eep_validator — Python port of @eep-dev/validator."""

import pytest
from eep_validator import (
    SSRFError,
    validate_ssrf,
    validate_event_type_pattern,
    matches_event_type,
    matches_any_pattern,
)


# ── SSRF Validation ───────────────────────────────────────────────────────────


class TestSSRFValidation:
    @pytest.mark.asyncio
    async def test_rejects_http_by_default(self):
        with pytest.raises(SSRFError, match="http://"):
            await validate_ssrf("http://example.com/hook")

    @pytest.mark.asyncio
    async def test_allows_http_when_opted_in(self):
        # This should not raise for the scheme; DNS may fail but that's OK
        try:
            await validate_ssrf("http://example.com/hook", allow_http=True)
        except SSRFError as e:
            assert "http://" not in str(e)

    @pytest.mark.asyncio
    async def test_rejects_ftp_scheme(self):
        with pytest.raises(SSRFError, match="Unsupported"):
            await validate_ssrf("ftp://example.com/file")

    @pytest.mark.asyncio
    async def test_rejects_localhost(self):
        with pytest.raises(SSRFError, match="localhost"):
            await validate_ssrf("https://localhost/hook")

    @pytest.mark.asyncio
    async def test_rejects_loopback_alias(self):
        with pytest.raises(SSRFError, match="Blocked"):
            await validate_ssrf("https://0.0.0.0/hook")

    @pytest.mark.asyncio
    async def test_rejects_private_ip(self):
        with pytest.raises(SSRFError):
            await validate_ssrf("https://192.168.1.1/hook", allow_http=True)

    @pytest.mark.asyncio
    async def test_rejects_invalid_url(self):
        with pytest.raises(SSRFError, match="Invalid"):
            await validate_ssrf("not-a-url")


# ── Event Type Patterns ───────────────────────────────────────────────────────


class TestEventTypePattern:
    def test_valid_simple(self):
        assert validate_event_type_pattern("com.example.entity.updated") is True

    def test_valid_wildcard(self):
        assert validate_event_type_pattern("com.example.entity.*") is True

    def test_rejects_uppercase(self):
        assert validate_event_type_pattern("com.example.Entity.*") is False

    def test_rejects_leading_dot(self):
        assert validate_event_type_pattern(".md.more") is False

    def test_rejects_double_dot(self):
        assert validate_event_type_pattern("md..more") is False


class TestMatchesEventType:
    def test_exact_match(self):
        assert matches_event_type("com.example.entity.updated", "com.example.entity.updated") is True

    def test_no_match(self):
        assert matches_event_type("com.example.entity.updated", "com.example.entity.deleted") is False

    def test_wildcard_match(self):
        assert matches_event_type("com.example.entity.updated", "com.example.entity.*") is True

    def test_wildcard_no_match(self):
        assert matches_event_type("md.other.entity.updated", "com.example.entity.*") is False

    def test_wildcard_prefix_exact(self):
        assert matches_event_type("com.example.entity", "com.example.entity.*") is True


class TestMatchesAnyPattern:
    def test_matches_one(self):
        patterns = ["com.example.entity.*", "com.example.content.*"]
        assert matches_any_pattern("com.example.entity.updated", patterns) is True

    def test_matches_none(self):
        patterns = ["com.example.entity.*"]
        assert matches_any_pattern("md.other.thing", patterns) is False
