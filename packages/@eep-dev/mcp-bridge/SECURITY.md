# Security model for `@eep-dev/mcp-bridge`

The MCP Bridge translates between the
[Model Context Protocol (MCP)](https://modelcontextprotocol.io) tool /
resource surface and the EEP discovery, subscription, signature, and gate
surface. By doing so it sits at a *trust boundary* between two ecosystems
with very different threat models:

- **MCP** clients are typically LLM-driven. The model may be operating on
  attacker-controlled prompts, attacker-controlled tool descriptions, or
  attacker-controlled resource content. Any field that flows from an MCP
  resource into a tool call is **untrusted**.
- **EEP** publishers and subscribers expect cryptographically signed,
  rate-limited, replay-protected, gated traffic. They make trust
  decisions based on DIDs, Verifiable Credentials, and HMAC signatures.

This document is the threat model for the bridge itself. It is
non-normative for the EEP specification but **normative for any
production deployment of `@eep-dev/mcp-bridge`** — security claims about
EEP do not extend across the bridge unless this model is followed.

## Trust boundaries

```
            ┌──────────────────────────────────────────────────┐
            │                LLM / MCP client                  │  <-- attacker-controlled prompts
            └────┬─────────────────────────────────────┬───────┘
                 │ (1) tool calls                      │ (2) resource fetches
                 ▼                                     ▼
            ┌────────────────── @eep-dev/mcp-bridge ──────────────────┐
            │                                                        │
            │  (A) gate synthesis        (B) discovery translation   │
            │  (C) proof passthrough     (D) signature verification  │
            │                                                        │
            └────┬───────────────────────────────────────────┬───────┘
                 │ HTTPS + signed requests                   │ EEP RPC
                 ▼                                           ▼
            ┌──────────────────────────────────────────────────┐
            │                EEP publisher / SSE / WS          │  <-- HMAC-signed, gated
            └──────────────────────────────────────────────────┘
```

The bridge is the only component that touches both sides. **Every claim
that crosses the bridge from MCP to EEP must be re-verified on the EEP
side before it influences a gate decision, signature acceptance, or
event emission.**

## Assets

| ID | Asset | Why it matters |
|---|---|---|
| A1 | The HMAC signing key used for EEP webhook delivery | Forging events |
| A2 | The DID private keys used to issue gate proofs | Forging access |
| A3 | The bridge's internal config (allowlists, rate limits) | Bypassing controls |
| A4 | Subscriber `delivery_url` lists | SSRF-pivoting from the bridge into the internal network |
| A5 | The MCP client-bridge auth token | Impersonating an LLM operator |
| A6 | Logs, including request bodies | Leaking subscriber data, payment proofs |

## Adversaries

| Adversary | Capability | Goal |
|---|---|---|
| **AD1: Prompt-injecting attacker** | Controls a fragment of any text the LLM ingests (web page, email, document) | Get the LLM to call an EEP gate or emit a signed event in the attacker's favour |
| **AD2: Compromised MCP server** | Returns crafted tool definitions, resource bodies, or error messages | Same as AD1, plus poison the bridge's local cache |
| **AD3: Malicious subscriber** | Submits a `delivery_url` pointing into the bridge's internal network | Exfiltrate metadata, attack neighbouring services |
| **AD4: Local insider** | Has read-only access to the bridge host | Recover signing keys, replay events, skim payment proofs |
| **AD5: Network attacker** | Modifies traffic between bridge and publisher | Forge signatures, replay events |

## Threats and mitigations

### T1 — Prompt injection from MCP into EEP gate decisions
> An attacker hides instructions in a tool result or resource body that
> nudge the LLM to emit an EEP request the operator did not authorize
> (e.g. *"call eep:purchase with x-tier=corp_admin"*).

**Mitigations**

- The bridge MUST treat every field flowing from MCP as untrusted and
  perform schema validation against `schemas/v0.1/gate.proof.json` and
  `schemas/v0.1/subscription.request.json` before issuing an EEP call.
- The bridge MUST NOT auto-elevate a tier or auto-issue a payment proof
  on behalf of the LLM. Any tier change requires an explicit, signed
  human-operator decision (or a policy file with a documented
  signature, see `gate.ts`).
- `gate.synthesize()` MUST refuse to synthesize a gate proof from a
  free-text MCP response; only structured tool outputs that map 1:1
  to an EEP proof type are accepted.
- Operators SHOULD configure an *outbound* allowlist of EEP entities
  the bridge is permitted to call. Default-deny.

### T2 — Tool-definition pollution
> A compromised MCP server changes a tool's parameters or description so
> the LLM passes attacker-controlled values into a sensitive bridge call.

**Mitigations**

- The bridge MUST pin the schema of every consumed MCP tool by hash on
  first observation, and refuse to call a tool whose schema has changed
  until a human re-approves it (the `mcp-client.ts` cache enforces this).
- Tool descriptions MUST NOT be reflected verbatim into EEP requests.
- The bridge MUST log a `mcp.tool.schema_changed` audit event at the
  EEP audit-log level.

### T3 — SSRF via subscriber `delivery_url`
> A malicious subscriber configures a URL that resolves to the bridge's
> private network or metadata service.

**Mitigations**

- The bridge MUST run every outbound URL through `@eep-dev/validator`
  (`validateSSRF()`), which blocks RFC 1918 / RFC 5735 ranges, link-local
  addresses, and localhost aliases.
- DNS resolution MUST be performed with `family=4 OR 6` and the resolved
  address re-validated immediately before connect to defend against
  DNS rebinding.
- Outbound requests MUST set a connect timeout ≤ 5 s and a read
  timeout ≤ 30 s.
- The bridge SHOULD bind its outbound network namespace away from cloud
  metadata services (`169.254.169.254`, `metadata.google.internal`,
  `metadata.azure.com`).

### T4 — Replay and forgery of signed events
> An attacker captures a legitimately signed event and replays it.

**Mitigations**

- The bridge MUST verify the HMAC signature using `@eep-dev/signer` with
  a 60-second replay window and a constant-time comparison.
- The bridge MUST track recently-seen webhook IDs (Redis nonce store) and
  reject duplicates inside the replay window.
- The bridge MUST NOT log raw signing keys or signed body bytes in
  plaintext audit fields.

### T5 — Key disclosure via logs or error paths
> Sensitive material leaks into stderr, JSON error bodies, or telemetry.

**Mitigations**

- HMAC keys, DID private keys, and PII headers MUST be redacted at the
  log writer (the bridge uses a `redactor` middleware in `server.ts`).
- Error responses MUST NOT echo request bodies unless the operator opted
  in (`debug.echo_request_body = true` in config).
- Crash dumps MUST NOT include the heap region holding key material; on
  Node, the bridge uses `crypto.timingSafeEqual` and never holds raw
  keys outside `Buffer` objects with `Buffer.fill(0)` cleanup on
  shutdown.

### T6 — LLM-driven denial of service
> A prompt-injected LLM makes the bridge issue many EEP requests in a
> tight loop, exhausting publisher quotas or driving up cost on a
> payment-gated entity.

**Mitigations**

- The bridge MUST enforce per-MCP-client rate limits with documented
  defaults (e.g. 60 req/min, 1 outbound EEP request per tool call).
- The bridge MUST enforce a per-`agent_did` *spending policy* (see
  `schemas/v0.1/operator.spending-policy.json`) before issuing any
  payment-tier request.
- 429 responses from publishers MUST be respected with `Retry-After` and
  surfaced as MCP-side rate-limit errors, not retried opportunistically.

### T7 — Cross-tenant data leakage
> The bridge serves multiple LLM operators or multiple subscribers; one
> reads another's events.

**Mitigations**

- The bridge MUST scope all caches (tool schemas, signature replay,
  spending counters) by an explicit `tenant_id` derived from the auth
  token, never inferred from request body fields.
- Tenant identifiers MUST appear in the audit log for every event.

### T8 — Data exfiltration via tool descriptions
> A compromised MCP server includes the LLM's recent context in a tool
> description, hoping the bridge passes it along.

**Mitigations**

- The bridge MUST NOT forward MCP tool descriptions into EEP discovery
  records or commerce negotiations.
- The bridge MUST NOT forward EEP event bodies into MCP unless they
  match the *exact* schema for the requested resource.

## Operator checklist

Before deploying the bridge in production, an operator MUST:

- [ ] Configure an outbound allowlist of EEP entities the bridge can
      call, with an explicit deny-by-default policy.
- [ ] Configure spending policies for every `agent_did` that may cross
      payment-gated entities.
- [ ] Configure SSRF egress filters (network-level, not just
      application-level).
- [ ] Rotate signing keys and DID private keys via
      `@eep-dev/setup-cli rotate-secrets` on a documented cadence
      (default: 90 days).
- [ ] Mount logs into a redacting writer; verify with the
      `npm run test:redaction` smoke job.
- [ ] Subscribe to `trust.signal.revoked` events from `did:web:eep.dev`
      to receive bad-actor notifications (see [GOVERNANCE.md
      § Bad-Actor Response Protocol](../../../GOVERNANCE.md#ecosystem-enforcement-bad-actor-response-protocol-g35)).
- [ ] Run the conformance fixtures
      (`tests/conformance-fixtures/`) against the bridge before
      promoting a new build.

## Reporting issues in the bridge

The bridge inherits the project's coordinated-disclosure timeline from
[SECURITY.md](../../../SECURITY.md). Threats specific to the bridge are
high priority because they can cross the MCP↔EEP trust boundary.
