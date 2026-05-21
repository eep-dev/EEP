# Discovery crosswalk — single-origin bundle

Offline fixture bundle backing the
[Discovery Crosswalk v1 guide](../../../../docs/guides/discovery-crosswalk-v1.md).

Every file in this directory pretends to be served from the **same HTTPS origin**,
`https://crosswalk.example`. The point is to show that an agentic publisher can
expose EEP, A2A, MCP and `llms.txt` side by side without any of them colliding on
URLs or contradicting each other.

## Contents

| File | Served at | Purpose |
|------|-----------|---------|
| `eep.json` | `/.well-known/eep.json` | EEP manifest. MUST validate against `schemas/v0.1/eep-manifest.json`. |
| `agent.json` | `/.well-known/agent.json` | A2A v0.3 Agent Card. Carries the `x-eep` extension from SPEC §12.2. |
| `mcp.json` | `/.well-known/mcp.json` | Informative MCP well-known discovery doc; tracks [modelcontextprotocol#1054](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/1054). |
| `llms.txt` | `/llms.txt` | Curated corpus pointing at the three manifests. |
| `link-header.http` | example HTTP response | Combined `Link:` header response demonstrating all `rel`s coexisting. |
| `dns-txt.txt` | DNS TXT records | Informative `_agent` (AID) and `_eep` (SPEC §12.5) bootstrap hints. |
| `expected.json` | (assertion) | Machine-readable summary of what a validator should see. |

## How to consume

The reference TypeScript test
[`crosswalk-fixture.test.ts`](../../../../packages/@eep-dev/discovery/src/crosswalk-fixture.test.ts)
loads `eep.json` through `@eep-dev/discovery`'s `validateManifest()` and asserts
that all sibling files are present. Implementations in other languages can do the
same — these are just bytes on disk.

## Status

Informative. No normative schemas change. See the guide for non-goals and the
`Discovery Crosswalk v1` section in `tests/conformance-fixtures/manifest.json`.
