# Copyright 2026 EEP Contributors — Apache-2.0
"""
eep_gates.resource_matcher — Wildcard resource pattern matching for gate access control.

Patterns use dot notation with * as a wildcard suffix.
  "profile.*"    matches "profile.bio", "profile.skills", "profile.contact.email"
  "*"            matches everything
  "events.public" matches only "events.public" exactly
"""

from __future__ import annotations

from typing import Dict, List, Tuple


def match_resource(pattern: str, resource: str) -> bool:
    """Check if a resource matches a given access pattern."""
    if pattern == "*":
        return True
    if pattern == resource:
        return True
    if pattern.endswith(".*"):
        prefix = pattern[:-2]
        return resource == prefix or resource.startswith(prefix + ".")
    return False


def matches_any(patterns: List[str], resource: str) -> bool:
    """Check if a resource matches ANY pattern in an access list."""
    return any(match_resource(p, resource) for p in patterns)


def pattern_specificity(pattern: str) -> int:
    """Comparable specificity score for an access pattern (higher = more specific).

      "*"          -> 0                   (universal wildcard, least specific)
      "a.b.*"      -> len(pattern)         (scope wildcard, longer prefix wins)
      "a.b.c"      -> len(pattern) + 1000  (exact literal, always beats a wildcard)

    The score is only meaningful for a pattern that already matches the resource;
    callers should guard with ``match_resource`` first (see ``best_specificity_for``).
    """
    if pattern == "*":
        return 0
    if pattern.endswith(".*"):
        return len(pattern)
    return len(pattern) + 1000


def best_specificity_for(patterns: List[str], resource: str) -> int:
    """Specificity of the most specific pattern in ``patterns`` that matches
    ``resource``, or ``-1`` when none of the patterns match."""
    best = -1
    for pattern in patterns:
        if not match_resource(pattern, resource):
            continue
        score = pattern_specificity(pattern)
        if score > best:
            best = score
    return best


def find_tiers_for_resource(
    tiers: Dict[str, Dict],
    resource: str,
) -> List[str]:
    """Find all tiers that grant access to a specific resource.

    Returns tier keys sorted by specificity (exact matches first, then wildcards).
    """
    matches: List[Tuple[str, int]] = []

    for key, tier in tiers.items():
        access = tier.get("access", []) if isinstance(tier, dict) else tier.access
        for pattern in access:
            if match_resource(pattern, resource):
                matches.append((key, pattern_specificity(pattern)))
                break

    matches.sort(key=lambda m: m[1], reverse=True)
    return [m[0] for m in matches]
