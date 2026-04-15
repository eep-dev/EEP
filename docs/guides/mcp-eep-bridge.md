# MCP <-> EEP Bridge Guide

## Purpose

The bridge converts MCP tool/resource surfaces into EEP-native discovery, service, and gate artifacts without changing MCP server internals.

## Implementations

- Node: `packages/@eep-dev/mcp-bridge`
- Python: `packages/eep-mcp-bridge-python`

## What the bridge exposes

1. `/.well-known/eep.json` manifest synthesized from MCP introspection.
2. `/eep/services` service catalog derived from MCP tools.
3. `/eep/gates` gate config synthesized from annotations and overrides.
4. `/mcp/tools/call` guarded call facade with fail-closed 402 behavior.

## Security posture

- Strict tool-name validation (`^[a-zA-Z0-9._:-]{1,128}$`)
- Unknown tool rejection
- Fail-closed gate enforcement
- Redteam coverage:
  - `packages/@eep-dev/mcp-bridge/src/security.test.ts`
  - `packages/eep-mcp-bridge-python/tests/test_bridge.py`

## Coverage and parity

- Node bridge: 100% threshold enforced via `vitest.config.ts`
- Python bridge: 100% threshold enforced via `pytest.ini`
- Shared fixture parity: `tests/parity/mcp-bridge-fixtures.json`
