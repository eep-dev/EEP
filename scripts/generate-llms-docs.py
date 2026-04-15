#!/usr/bin/env python3
"""
Generate llms.txt (concise overview for RAG) and llms-full.txt (comprehensive knowledge base)
from existing EEP documentation. Reuses exclusion logic from generate-eep-file-manifest.py
to stay consistent with .gitignore and prior audits.

Usage (from repo root):
  python3 EEP/scripts/generate-llms-docs.py --mode both

Outputs:
  - llms.txt: Overview (README inventory, conformance, guide index, quick-start)
  - llms-full.txt: Full SPECIFICATION.md + selected guides with clear file headers
"""

from __future__ import annotations

import argparse
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

# Reuse exclusion logic from manifest generator (copied here for standalone execution)
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
        "audit",
        "tmp",
        "temp",
        ".cache",
        ".parcel-cache",
        ".pnpm-store",
        ".yarn",
    }
)

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

_EXCLUDE_NAMES: frozenset[str] = frozenset({".DS_Store", "Thumbs.db"})


def _should_skip_dir(rel_parts: tuple[str, ...], name: str) -> bool:
    if name in _EXCLUDE_DIR_NAMES:
        return True
    if name.startswith(".tmp-eep-"):
        return True
    if name.endswith(".egg-info"):
        return True
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
    """Collect paths (reused from manifest generator)."""
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

EEP_ROOT = Path(__file__).parent.parent
DOCS_ROOT = EEP_ROOT / "docs"
LLMS_TXT = EEP_ROOT / "llms.txt"
LLMS_FULL_TXT = EEP_ROOT / "llms-full.txt"


def build_llms_txt() -> str:
    """Concise overview for LLMs (inventory, conformance, quick guide index)."""
    lines = [
        "# EEP llms.txt — Concise Overview for Agents (v0.1)",
        "# Generated: " + datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "",
        "EEP (Entity Engagement Protocol) is an open standard for push-based, verifiable communication between digital entities and agents.",
        "It defines three layers: Layer 1 (REST state resolution/discovery), Layer 2 (SSE + webhooks signal stream), Layer 3 (WebSocket pulse).",
        "Core promises: documented wire format, libraries, and compliance tooling. No ranking/traffic claims.",
        "",
        "## Repository Inventory (from README.md)",
        "- Normative spec: docs/current/SPECIFICATION.md",
        "- Schemas: schemas/v0.1/",
        "- TS packages: packages/@eep-dev/* (@eep-dev/signer, validator, gates, middleware, mcp-bridge, compliance-cli, setup-cli)",
        "- Python parity: packages/eep-*-python/",
        "- Compliance CLI: packages/@eep-dev/compliance-cli (with --report-html, --report-json, --report-md)",
        "- Setup CLI: npx @eep-dev/setup-cli (init, inject, apply --production)",
        "- Reference stack: examples/eep-reference-implementation/ (Node+Python+Postgres+Redis)",
        "- Realworld demo: realworld-simulation/ (npm run demo)",
        "- LangGraph/Claude example: examples/langgraph-eep-agent/",
        "- Interactive Playground: eep-site/app/playground (browser validation + signing)",
        "- Tests: test.sh, tests/cross-impl/, tests/parity/",
        "",
        "## Conformance Levels",
        "- Core: discovery, subscription, webhook, HMAC, CloudEvents",
        "- Standard: + SSE, rate limits",
        "- Full: + manifest fields, 402/403 gates, registry economics",
        "Use: npx @eep-dev/compliance-cli --target <url> --report-html report.html",
        "",
        "## Key Guides (selected)",
        "- how-to-setup-cli.md: init/inject/apply/verify",
        "- integrate-eep-after-setup-cli.md: wiring middleware after artifacts",
        "- five-minute-proof.md: quick validation",
        "- testing-and-validation.md, langgraph-eep-agent.md, mcp-eep-bridge.md",
        "- realworld-simulation.md: Old Web vs EEP comparison",
        "",
        "Security contact: hello@eep.dev (subject [Security])",
        "License: Apache 2.0",
        "See full details in llms-full.txt or SPECIFICATION.md.",
        "",
        "For complete normative spec and all guides, consult llms-full.txt.",
    ]
    return "\n".join(lines)


def build_llms_full() -> str:
    """Full knowledge base with file headers."""
    lines = [
        "# EEP llms-full.txt — Comprehensive Knowledge Base (v0.1)",
        "# Generated: " + datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "",
        "This file concatenates the normative specification, key guides, compliance tooling, and examples.",
        "Use file headers for RAG context.",
        "",
        "=== FILE: EEP/README.md ===",
        (EEP_ROOT / "README.md").read_text(encoding="utf-8"),
        "",
        "=== FILE: EEP/docs/current/SPECIFICATION.md ===",
        (DOCS_ROOT / "current/SPECIFICATION.md").read_text(encoding="utf-8"),
        "",
        "=== FILE: EEP/docs/guides/how-to-setup-cli.md ===",
        (DOCS_ROOT / "guides/how-to-setup-cli.md").read_text(encoding="utf-8"),
        "",
        "=== FILE: EEP/docs/guides/integrate-eep-after-setup-cli.md ===",
        (DOCS_ROOT / "guides/integrate-eep-after-setup-cli.md").read_text(encoding="utf-8"),
        "",
        "=== FILE: EEP/docs/guides/five-minute-proof.md ===",
        (DOCS_ROOT / "guides/five-minute-proof.md").read_text(encoding="utf-8"),
        "",
        "=== FILE: EEP/docs/guides/testing-and-validation.md ===",
        (DOCS_ROOT / "guides/testing-and-validation.md").read_text(encoding="utf-8"),
        "",
        "=== FILE: EEP/docs/guides/langgraph-eep-agent.md ===",
        (DOCS_ROOT / "guides/langgraph-eep-agent.md").read_text(encoding="utf-8"),
        "",
        "=== FILE: EEP/docs/guides/mcp-eep-bridge.md ===",
        (DOCS_ROOT / "guides/mcp-eep-bridge.md").read_text(encoding="utf-8"),
        "",
        "=== FILE: EEP/packages/@eep-dev/compliance-cli/README.md ===",
        (EEP_ROOT / "packages/@eep-dev/compliance-cli/README.md").read_text(encoding="utf-8"),
        "",
        "=== FILE: EEP/examples/README.md ===",
        (EEP_ROOT / "examples/README.md").read_text(encoding="utf-8"),
        "",
        "=== FILE: EEP/docs/guides/realworld-simulation.md ===",
        (DOCS_ROOT / "guides/realworld-simulation.md").read_text(encoding="utf-8"),
        "",
        "# End of llms-full.txt — see SPECIFICATION.md for normative wire format, schemas/v0.1/ for JSON contracts, and CHANGELOG.md for updates.",
    ]
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate llms.txt and llms-full.txt from EEP docs.")
    parser.add_argument("--mode", choices=["llms", "full", "both"], default="both", help="Which file(s) to generate")
    args = parser.parse_args()

    if args.mode in ("llms", "both"):
        LLMS_TXT.write_text(build_llms_txt(), encoding="utf-8")
        print(f"Wrote {LLMS_TXT.relative_to(EEP_ROOT)}", file=sys.stderr)

    if args.mode in ("full", "both"):
        LLMS_FULL_TXT.write_text(build_llms_full(), encoding="utf-8")
        print(f"Wrote {LLMS_FULL_TXT.relative_to(EEP_ROOT)}", file=sys.stderr)

    print("llms docs generated successfully. Use in RAG contexts for EEP knowledge.", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
