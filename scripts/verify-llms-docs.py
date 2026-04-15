#!/usr/bin/env python3
"""
Validate llms.txt and llms-full.txt structure after generation.
Exit 0 if OK, 1 if missing required markers or files.

Usage:
  python3 EEP/scripts/verify-llms-docs.py
"""

from __future__ import annotations

import sys
from pathlib import Path

EEP_ROOT = Path(__file__).parent.parent
LLMS = EEP_ROOT / "llms.txt"
LLMS_FULL = EEP_ROOT / "llms-full.txt"

LLMS_REQUIRED = [
    "Entity Engagement Protocol",
    "Layer 1",
    "SPECIFICATION.md",
    "compliance-cli",
    "hello@eep.dev",
    "llms-full.txt",
    "Conformance Levels",
    "## Repository Inventory",
]

LLMS_FULL_REQUIRED = [
    "=== FILE:",
    "SPECIFICATION.md",
    "Entity engagement protocol",
]


def main() -> int:
    errors: list[str] = []

    if not LLMS.is_file():
        errors.append(f"Missing {LLMS.relative_to(EEP_ROOT.parent)} — run: python3 EEP/scripts/generate-llms-docs.py --mode llms")
    else:
        text = LLMS.read_text(encoding="utf-8")
        for marker in LLMS_REQUIRED:
            if marker not in text:
                errors.append(f"llms.txt missing marker: {marker!r}")

    if not LLMS_FULL.is_file():
        errors.append(f"Missing {LLMS_FULL.relative_to(EEP_ROOT.parent)} — run: python3 EEP/scripts/generate-llms-docs.py --mode full")
    else:
        text = LLMS_FULL.read_text(encoding="utf-8")
        if len(text) < 50_000:
            errors.append(f"llms-full.txt suspiciously short ({len(text)} bytes); regenerate?")
        for marker in LLMS_FULL_REQUIRED:
            if marker not in text:
                errors.append(f"llms-full.txt missing marker: {marker!r}")

    if errors:
        print("verify-llms-docs.py FAILED:", file=sys.stderr)
        for e in errors:
            print(f"  - {e}", file=sys.stderr)
        return 1

    print(
        f"OK: {LLMS.name} ({LLMS.stat().st_size} bytes) and "
        f"{LLMS_FULL.name} ({LLMS_FULL.stat().st_size} bytes) validated.",
        file=sys.stderr,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
