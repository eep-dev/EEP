# Test secrets used in conformance fixtures

> **THESE SECRETS ARE PUBLIC. They exist solely to make fixtures
> reproducible across implementations. Never use them in production.**

The following symmetric secrets and DIDs appear in fixture files. They
are intentionally fixed so that, given the same input bytes and the
same secret, every conforming implementation produces the same
HMAC and arrives at the same verification verdict.

## HMAC secrets

| Label | Value | Used by |
|---|---|---|
| `TEST_SECRET_A` | `super-secret-test-key-1234` | `signature/valid-*`, `signature/expired-*`, multi-signature fixtures |
| `TEST_SECRET_B` | `another-secret-key-zzz-9876` | `signature/wrong-secret`, multi-tenant fixtures |
| `TEST_SECRET_REJECT_SHORT` | `tiny` | `signature/short-secret-rejected` (15 chars; MUST be rejected) |

## Stable timestamps

Fixtures that rely on absolute time use this base:

| Label | Value (ISO 8601) | Unix seconds |
|---|---|---|
| `TEST_TIMESTAMP_FRESH` | `2026-05-09T12:00:00Z` | `1778414400` |
| `TEST_TIMESTAMP_EXPIRED` | `2026-05-09T11:58:00Z` | `1778414280` (≈ 2 min before fresh) |

When verifying a fixture, the implementation under test SHOULD freeze
its concept of "now" to `TEST_TIMESTAMP_FRESH` (most fixtures pass
`now` explicitly to make this trivial).

## Stable webhook IDs

Webhook IDs are deterministic so the signed content is reproducible:

- `TEST_WEBHOOK_ID = "msg_01HN3QK7GXFIXTURE0001"`
- `TEST_WEBHOOK_ID_TWO = "msg_01HN3QK7GXFIXTURE0002"`

## Stable DIDs (test only)

DID-keyed fixtures use:

- `did:web:test.eep.dev:u:alice`
- `did:web:test.eep.dev:o:acme`
- `did:web:test.eep.dev:agent:test-agent`

The corresponding key material lives only in fixture files and never on
any live key server. Consumers MUST NOT trust `did:web:test.eep.dev`
outside this fixture suite.
