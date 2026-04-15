#!/usr/bin/env python3
"""
Emit a sorted list of EEP source paths for audits when `git ls-files` is unavailable.

Exclusions mirror EEP/.gitignore (dependencies, build outputs, caches, secrets dirs).
Debug details go to stderr; the manifest body is stdout-clean (paths only, after header).

Usage (from EEP repo root):
  python3 scripts/generate-eep-file-manifest.py > docs/reports/eep-git-files-manifest.txt
"""

from __future__ import annotations

import os
import sys
from datetime import datetime, timezone

EEP_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Directory names to prune (do not descend).
_EXCLUDE_DIR_NAMES: frozenset[str] = frozenset(
    {
        ".git",
        "node_modules",
        "dist",
        "build",
        ".next",
        "out",
        ".turbo",
        "coverage",
        "htmlcov",
        ".nyc_output",
        ".vitest",
        ".vite",
        "test-results",
        "playwright-report",
        "blob-report",
        ".pytest_cache",
        "__pycache__",
        ".mypy_cache",
        ".ruff_cache",
        ".hypothesis",
        ".tox",
        ".eggs",
        "pip-wheel-metadata",
        "venv",
        ".venv",
        "secrets",
        "audit",  # docs/audit/ internal snapshots (parent path checked below)
        "tmp",
        "temp",
        ".cache",
        ".parcel-cache",
        ".pnpm-store",
        ".yarn",
    }
)

# File suffixes to skip (leading dot included where applicable).
_EXCLUDE_SUFFIXES: tuple[str, ...] = (
    ".tsbuildinfo",
    ".js.map",
    ".pyc",
    ".pyo",
    ".pyd",
    ".coveragerc",
    ".coverage",
    ".aux",
    ".bbl",
    ".blg",
    ".fdb_latexmk",
    ".fls",
    ".lof",
    ".lot",
    ".out",
    ".synctex.gz",
    ".toc",
    ".xdv",
    ".log",
    ".swp",
    ".swo",
    ".tmp",
)

# Exact basenames to skip.
_EXCLUDE_NAMES: frozenset[str] = frozenset({".DS_Store", "Thumbs.db"})


def _should_skip_dir(rel_parts: tuple[str, ...], name: str) -> bool:
    if name in _EXCLUDE_DIR_NAMES:
        return True
    if name.startswith(".tmp-eep-"):
        return True
    if name.endswith(".egg-info"):
        return True
    # docs/audit/
    if rel_parts == ("docs",) and name == "audit":
        return True
    return False


def _should_skip_file(rel_path: str, name: str) -> bool:
    if name in _EXCLUDE_NAMES:
        return True
    lower = name.lower()
    for suf in _EXCLUDE_SUFFIXES:
        if lower.endswith(suf):
            return True
    # Secrets / env (see EEP/.gitignore)
    if name == ".env" or (name.startswith(".env.") and not name.endswith(".example")):
        return True
    if lower.endswith((".pem", ".p12", ".pfx", ".jks", ".keystore", ".key")):
        return True
    if name.endswith(".secret"):
        return True
    if "service-account" in lower and name.endswith(".json"):
        return True
    return False


def collect_paths(root: str) -> list[str]:
    out: list[str] = []
    root_abs = os.path.abspath(root)
    for dirpath, dirnames, filenames in os.walk(root_abs, topdown=True):
        rel_dir = os.path.relpath(dirpath, root_abs)
        rel_parts = () if rel_dir in (".", "") else tuple(rel_dir.split(os.sep))

        dirnames[:] = sorted(d for d in dirnames if not _should_skip_dir(rel_parts, d))

        for fn in filenames:
            if _should_skip_file("", fn):
                continue
            full = os.path.join(dirpath, fn)
            rel_file = os.path.relpath(full, root_abs)
            if os.sep != "/":
                rel_file = rel_file.replace(os.sep, "/")
            out.append(rel_file)
    out.sort()
    return out


def main() -> int:
    paths = collect_paths(EEP_ROOT)
    gen_utc = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    print(
        "\n".join(
            [
                f"# EEP file manifest (generated {gen_utc})",
                "#",
                "# Canonical command when this tree is a git repository:",
                "#   cd EEP && git ls-files | sort > docs/reports/eep-git-files-manifest.txt",
                "#",
                "# This workspace had no git metadata; paths were collected with",
                "#   python3 scripts/generate-eep-file-manifest.py",
                "# using exclusions aligned with EEP/.gitignore (see script source).",
                f"# Path count: {len(paths)}",
                "# --- paths follow (one per line) ---",
            ]
        )
    )
    for p in paths:
        print(p)

    print(f"Collected {len(paths)} paths under {EEP_ROOT}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
