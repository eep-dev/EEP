# Discovery crosswalk v1

> **Informative — non-normative.** This guide documents how a single agentic
> publisher can co-locate EEP, A2A, MCP and `llms.txt` discovery surfaces on
> one origin without conflict. It does not change the EEP v0.1 specification.
>
> Tracks issue [#27](https://github.com/eep-dev/EEP/issues/27).

## Why a crosswalk

Agentic publishers today face **discovery sprawl**: the same domain is expected
to expose multiple machine-readable surfaces — EEP at `/.well-known/eep.json`,
A2A at `/.well-known/agent.json` (Agent Card), the emerging MCP discovery doc at
`/.well-known/mcp.json`, optional DNS `_agent` bootstrap hints (AID), and the
agent-readable corpus at `/llms.txt`.

Without a documented crosswalk, integrators assume these protocols **compete,
duplicate URLs, or contradict** each other. They do not. Each one solves a
different layer; EEP is one of them. This guide shows the recipe.

## Surface map

| Surface | URL convention | Purpose | EEP relationship |
|---------|----------------|---------|------------------|
| **EEP manifest** | `/.well-known/eep.json` | Entity engagement — discovery, realtime streams, gates, payment-aware access | The EEP surface itself ([SPEC §12](../current/SPECIFICATION.md)) |
| **A2A Agent Card** | `/.well-known/agent.json` | Agent-to-agent task delegation lifecycle | Complementary — carries the `x-eep` extension ([SPEC §12.2](../current/SPECIFICATION.md)) |
| **MCP discovery** | `/.well-known/mcp.json` *(informative; tracks [modelcontextprotocol#1054](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/1054))* | Tool / resource invocation for model runtimes | Complementary — MCP wraps tools, EEP publishes entity events |
| **DNS `_agent` TXT** | `_agent.<domain>` (AID) | Bootstrap hint pointing at the well-known docs | Optional; EEP also defines `_eep.<domain>` in [SPEC §12.5](../current/SPECIFICATION.md) |
| **`llms.txt`** | `/llms.txt` | Curated corpus for retrieval-oriented agents | Complementary — link the manifests above from it |

See also the protocol-scope tables in
[eep-positioning-complementary.md](./eep-positioning-complementary.md) and
[protocol-positioning-matrix.md](./protocol-positioning-matrix.md). The
short pitch stays the same: *MCP connects agents to tools; A2A connects agents
to agents; EEP connects subscribers to entity state.*

## URL layout convention

Use **one HTTPS origin** and put every machine-readable surface under
`/.well-known/*` (or, for `llms.txt`, at the document root). No rewrites or
path prefixes required.

```
https://crosswalk.example/
├── .well-known/
│   ├── eep.json          ← EEP manifest        (normative; schemas/v0.1/eep-manifest.json)
│   ├── agent.json        ← A2A Agent Card      (A2A v0.3)
│   └── mcp.json          ← MCP discovery       (informative)
├── llms.txt              ← curated corpus
└── eep/                  ← EEP runtime endpoints (subscribe, stream, gates, ...)
```

DNS records sit on the side; they are optional bootstrap hints and never the
source of truth for the manifest content.

## Minimal JSON examples

All four files below are also available offline as a fixture bundle:
[`tests/conformance-fixtures/discovery/crosswalk-host/`](../../tests/conformance-fixtures/discovery/crosswalk-host/).

### `/.well-known/eep.json`

Subset of the SPEC §12.3 example. MUST validate against
[`schemas/v0.1/eep-manifest.json`](../../schemas/v0.1/eep-manifest.json).

```json
{
  "did": "did:web:crosswalk.example",
  "eep_version": "0.1",
  "layers": {
    "layer1": "https://crosswalk.example/eep",
    "layer2_sse": "https://crosswalk.example/eep/stream",
    "layer2_webhook": "https://crosswalk.example/eep/subscribe",
    "layer3_ws": "wss://crosswalk.example/eep/pulse"
  },
  "supported_content_types": ["application/json", "text/markdown", "text/toon"],
  "pqc_ready": false,
  "x402_enabled": true
}
```

### `/.well-known/agent.json` (A2A v0.3 Agent Card)

Carries the `x-eep` extension from SPEC §12.2 so an ANP-aware client can pivot
from the agent card straight into the EEP stream.

```json
{
  "schema_version": "0.3.0",
  "name": "crosswalk-example",
  "url": "https://crosswalk.example/a2a",
  "version": "1.0.0",
  "capabilities": { "streaming": true, "push_notifications": true },
  "x-eep": {
    "subscribe_url": "https://crosswalk.example/eep/subscribe",
    "stream_url": "https://crosswalk.example/eep/stream",
    "source_did": "did:web:crosswalk.example",
    "supported_events": ["com.example.entity.*"],
    "anp_compatible": true
  }
}
```

### `/.well-known/mcp.json` (informative)

The MCP well-known discovery shape is still in proposal — see
[modelcontextprotocol#1054](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/1054).
The shape below mirrors that draft and adds a `related` block so clients can
hop between surfaces; field names may change as the upstream PR lands.

```json
{
  "schema_version": "draft-0",
  "servers": [
    { "name": "crosswalk-tools", "transport": "streamable-http",
      "url": "https://crosswalk.example/mcp" }
  ],
  "related": {
    "eep_manifest": "https://crosswalk.example/.well-known/eep.json",
    "agent_card":   "https://crosswalk.example/.well-known/agent.json"
  }
}
```

### DNS TXT (informative)

```
_agent.crosswalk.example.  IN  TXT  "v=aid1; eep=https://crosswalk.example/.well-known/eep.json; a2a=https://crosswalk.example/.well-known/agent.json; mcp=https://crosswalk.example/.well-known/mcp.json"
_eep.crosswalk.example.    IN  TXT  "v=eep1; manifest=https://crosswalk.example/.well-known/eep.json"
```

The `_eep.<domain>` form is defined normatively in
[SPEC §12.5](../current/SPECIFICATION.md). `_agent.<domain>` is informative; an
EEP client SHOULD fall back to HTTP `/.well-known/*` probing if it is absent.

### `/llms.txt`

```markdown
# Crosswalk Example

> Single-origin host exposing EEP, A2A, MCP and llms.txt.

## Machine-readable surfaces
- [EEP manifest](https://crosswalk.example/.well-known/eep.json)
- [A2A Agent Card](https://crosswalk.example/.well-known/agent.json)
- [MCP discovery](https://crosswalk.example/.well-known/mcp.json)
```

## Combined `Link` response header

Any entity resolution response can advertise all surfaces in a single round
trip. This aligns with the existing EEP `Link` examples in
[SPEC §12.1](../current/SPECIFICATION.md).

```http
HTTP/1.1 200 OK
Content-Type: application/json
Link: </.well-known/eep.json>; rel="eep-manifest"; type="application/json"
Link: </.well-known/agent.json>; rel="agent-card"; type="application/json"
Link: </.well-known/mcp.json>; rel="mcp-discovery"; type="application/json"
Link: <https://crosswalk.example/eep/subscribe>; rel="subscribe"; type="application/json"
Link: <https://crosswalk.example/eep/stream?source=crosswalk.example>; rel="monitor"
Link: </llms.txt>; rel="llms"; type="text/plain"
```

## When to use which (decision tree)

```
Is the question "what changed about this entity and how do I follow it?"
   ├─ yes → EEP                                  (/.well-known/eep.json)
   └─ no  → Is it "call a tool / use a resource"?
               ├─ yes → MCP                       (/.well-known/mcp.json)
               └─ no  → Is it "delegate a task to another agent"?
                           ├─ yes → A2A           (/.well-known/agent.json)
                           └─ no  → "feed an LLM curated context"
                                       → /llms.txt
```

The crosswalk does not pick one for you; it makes the question answerable
from a single origin in a single round trip.

## Conformance and fixtures

The companion fixture bundle at
[`tests/conformance-fixtures/discovery/crosswalk-host/`](../../tests/conformance-fixtures/discovery/crosswalk-host/)
contains the example files above as bytes-on-disk. The reference test
[`packages/@eep-dev/discovery/src/crosswalk-fixture.test.ts`](../../packages/@eep-dev/discovery/src/crosswalk-fixture.test.ts)
loads `eep.json` through `validateManifest()` and confirms every sibling file
is present.

A conformance-cli probe that logs PASS when a target host serves both
`/.well-known/eep.json` and `/.well-known/agent.json` is tracked as a follow-up
to this guide; the absence of sibling surfaces is **not** an EEP conformance
failure.

## Non-goals (v1)

- **No normative spec changes.** This is an informative guide; EEIP can follow
  if a normative surface map is later agreed.
- **No global agent directory or marketplace.**
- **Not a replacement** for MCP, A2A or ANP discovery; their respective specs
  remain authoritative for their own surfaces.

## References

- [SPEC §12 Discovery](../current/SPECIFICATION.md) — primary normative source for `/.well-known/eep.json`, `Link` headers and DNS TXT.
- [eep-positioning-complementary.md](./eep-positioning-complementary.md) — one-page comparison of EEP vs MCP / A2A / ANP.
- [protocol-positioning-matrix.md](./protocol-positioning-matrix.md) — scope matrix.
- [strategy/unmet-needs-map.md](../strategy/unmet-needs-map.md) — why the crosswalk lands here.
- [A2A Agent Card](https://github.com/a2aproject/A2A) — upstream spec.
- [MCP well-known discussion (PR #1054)](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/1054) — informative shape source.
