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
                if pattern == "*":
                    specificity = 0
                elif pattern.endswith(".*"):
                    specificity = len(pattern)
                else:
                    specificity = len(pattern) + 1000
                matches.append((key, specificity))
                break

    matches.sort(key=lambda m: m[1], reverse=True)
    return [m[0] for m in matches]
