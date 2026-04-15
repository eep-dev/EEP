# Copyright 2026 EEP Contributors — Apache-2.0
"""Cross-language parity fixtures for proof validator boundary cases."""

from __future__ import annotations

import json
from pathlib import Path

from eep_gates import validate_proof_structure


def _fixtures():
    fixture_path = (
        Path(__file__).resolve().parents[3]
        / "tests"
        / "parity"
        / "proof-validator-boundary-fixtures.json"
    )
    return json.loads(fixture_path.read_text(encoding="utf-8"))


def test_proof_validator_parity_fixtures():
    fixtures = _fixtures()
    for fixture in fixtures:
        result = validate_proof_structure(fixture["proof"])
        assert (
            result.valid == fixture["expected_valid"]
        ), f"fixture={fixture['name']} expected={fixture['expected_valid']} got={result.valid}"
