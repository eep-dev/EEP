# Copyright 2026 EEP Contributors — Apache-2.0
"""
eep_validator — SSRF prevention and payload validation for EEP publishers.

Python port of @eep-dev/validator (TypeScript).

Security rationale: see EEP/docs/current/security.md §3
"""

from __future__ import annotations

import ipaddress
import re
import socket
from typing import Dict, List, Optional
from urllib.parse import urlparse


class SSRFError(Exception):
    """Raised when a URL points to an internal / private network address."""

    def __init__(self, message: str) -> None:
        super().__init__(f"SSRFError: {message}")


# ── Blocked ranges ─────────────────────────────────────────────────────────────

_BLOCKED_NETWORKS = [
    ipaddress.ip_network("127.0.0.0/8"),       # Loopback
    ipaddress.ip_network("10.0.0.0/8"),         # Private A
    ipaddress.ip_network("172.16.0.0/12"),      # Private B
    ipaddress.ip_network("192.168.0.0/16"),     # Private C
    ipaddress.ip_network("169.254.0.0/16"),     # Link-local (incl. AWS metadata)
    ipaddress.ip_network("0.0.0.0/8"),          # This network
    ipaddress.ip_network("224.0.0.0/4"),        # Multicast
    ipaddress.ip_network("240.0.0.0/4"),        # Reserved
    ipaddress.ip_network("::1/128"),            # IPv6 loopback
    ipaddress.ip_network("fc00::/7"),           # IPv6 unique local
    ipaddress.ip_network("fe80::/10"),          # IPv6 link-local
]

_LOCALHOST_ALIASES = frozenset(["localhost", "0", "0.0.0.0", "[::1]", "::1"])


def _is_blocked_ip(ip_str: str) -> Optional[str]:
    """Return the matching blocked network label, or None if public."""
    try:
        addr = ipaddress.ip_address(ip_str)
    except ValueError:
        return None

    # Also check IPv4-mapped IPv6
    if isinstance(addr, ipaddress.IPv6Address) and addr.ipv4_mapped:
        addr = addr.ipv4_mapped

    for network in _BLOCKED_NETWORKS:
        if addr in network:
            return str(network)
    return None


# ── SSRF Validation ────────────────────────────────────────────────────────────


async def validate_ssrf(url_string: str, *, allow_http: bool = False) -> None:
    """Validate that a URL is safe to use as a webhook delivery endpoint.

    Checks:
      1. URL uses https:// (or http:// if ``allow_http`` is True)
      2. DNS resolves to a public IP (no private/reserved ranges)
      3. Hostname is not a localhost alias

    Raises:
        SSRFError: If the URL is unsafe.
    """
    try:
        parsed = urlparse(url_string)
    except Exception:
        raise SSRFError("Invalid URL: could not parse")

    if not parsed.scheme or not parsed.hostname:
        raise SSRFError("Invalid URL: could not parse")

    # 1. Scheme validation
    if parsed.scheme == "http" and not allow_http:
        raise SSRFError("http:// URLs are not allowed. Use https:// instead.")
    if parsed.scheme not in ("https", "http"):
        raise SSRFError(f"Unsupported URL scheme: {parsed.scheme}")

    # 2. Localhost alias check
    hostname = parsed.hostname.lower()
    if hostname in _LOCALHOST_ALIASES:
        raise SSRFError(f"Blocked hostname: '{hostname}' resolves to localhost")

    # 3. DNS resolution and IP validation
    try:
        results = socket.getaddrinfo(hostname, None, socket.AF_UNSPEC, socket.SOCK_STREAM)
    except socket.gaierror as e:
        raise SSRFError(f"DNS resolution failed for '{hostname}': {e}")

    for family, _, _, _, sockaddr in results:
        ip = sockaddr[0]
        blocked = _is_blocked_ip(ip)
        if blocked:
            raise SSRFError(f"Blocked IP: {ip} ({hostname}) falls within {blocked}")


def validate_ssrf_sync(url_string: str, *, allow_http: bool = False) -> None:
    """Synchronous version of validate_ssrf."""
    import asyncio
    loop = asyncio.new_event_loop()
    try:
        loop.run_until_complete(validate_ssrf(url_string, allow_http=allow_http))
    finally:
        loop.close()


# ── Event Type Validation ──────────────────────────────────────────────────────

_EVENT_TYPE_RE = re.compile(r"^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)*(\.\*)?$")


def validate_event_type_pattern(pattern: str) -> bool:
    """Validate an event type pattern string (dot-notation with optional ``.*`` suffix)."""
    return bool(_EVENT_TYPE_RE.match(pattern))


def matches_event_type(event_type: str, pattern: str) -> bool:
    """Check if an event type matches a subscription pattern.

    ``com.example.entity.*`` matches ``com.example.entity.updated``.
    """
    if pattern.endswith(".*"):
        prefix = pattern[:-2]
        return event_type == prefix or event_type.startswith(f"{prefix}.")
    return event_type == pattern


def matches_any_pattern(event_type: str, patterns: List[str]) -> bool:
    """Check if an event type matches any pattern in a subscription."""
    return any(matches_event_type(event_type, p) for p in patterns)


__all__ = [
    "SSRFError",
    "validate_ssrf",
    "validate_ssrf_sync",
    "validate_event_type_pattern",
    "matches_event_type",
    "matches_any_pattern",
]
