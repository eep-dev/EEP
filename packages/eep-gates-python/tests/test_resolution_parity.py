# Copyright 2026 EEP Contributors — Apache-2.0
"""Cross-language parity fixtures for the default-tier specificity override.

These cases use no proofs (deterministic; no semantic verifier needed), so the
Python and TypeScript resolvers must agree on granted/tier for each fixture.
The shared fixture file is also consumed by the TypeScript suite
(``packages/@eep-dev/gates/src/resolution-parity.test.ts``).
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from eep_gates import resolve_access


def _fixtures():
    fixture_path = (
        Path(__file__).resolve().parents[3]
        / "tests"
        / "parity"
        / "gate-resolution-specificity-fixtures.json"
    )
    return json.loads(fixture_path.read_text(encoding="utf-8"))


@pytest.mark.asyncio
async def test_gate_resolution_specificity_parity_fixtures():
    fixtures = _fixtures()
    assert fixtures, "expected at least one resolution parity fixture"
    for fixture in fixtures:
        result = await resolve_access([], fixture["config"], fixture["resource"])
        assert result.granted == fixture["expected_granted"], (
            f"fixture={fixture['name']} granted expected={fixture['expected_granted']} "
            f"got={result.granted}"
        )
        assert result.tier == fixture["expected_tier"], (
            f"fixture={fixture['name']} tier expected={fixture['expected_tier']} "
            f"got={result.tier}"
        )
