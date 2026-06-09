# EEIP-TEMPLATE

Use this template to propose changes to the EEP protocol. Copy this file, rename it `EEIP-{number}-{short-title}.md`, and submit a pull request to the `docs/eeips/` directory.

---

## Metadata

| Field | Value |
|---|---|
| **EEIP Number** | (assigned by maintainers) |
| **Title** | _Short descriptive title_ |
| **Author(s)** | _Name \<email\> or GitHub handle_ |
| **Status** | `Draft` |
| **Type** | `Protocol` / `Informational` / `Process` / `Sector Extension` |
| **Created** | _YYYY-MM-DD_ |
| **Requires** | _EEIP numbers this depends on (if any)_ |
| **EEP Layer** | `Layer 1 (REST)` / `Layer 2 (SSE/Webhooks)` / `Layer 3 (WebSocket)` / `Schema` / `Security` / `Commerce` |

> **If Type is `Sector Extension`**, add the following additional fields:

| Sector Extension Field | Value |
|---|---|
| **Extension Name** | `EEP-{Sector}-{Major}.{Minor}` (e.g., `EEP-FinServ-1.0`) |
| **Base EEP Tier** | `Core` / `Standard` / `Full` |
| **Sector** | _Industry vertical (e.g., Financial Services, Healthcare)_ |
| **Regulatory Framework** | _Regulation name + article (e.g., EU DORA Art. 9)_ |
| **Sector Credential Type** | `EEPConformanceCredential_{Sector}_{Major}_{Minor}` |
| **Co-Author/Reviewer** | _Recognized sector body or regulatory authority_ |

---

## Abstract

_One paragraph summary of the proposed change. What does it do and why?_

---

## Motivation

_Why is this change needed? What problem does it solve?_

Describe:
- The current behavior / limitation
- The pain point for implementers or users
- Why existing mechanisms are insufficient

---

## Specification

_The detailed technical specification of the proposed change._

This section MUST be precise enough for independent implementers to produce compatible implementations without further clarification.

### Changes to Protocol

_Describe changes to HTTP endpoints, headers, request/response bodies, event types, or WebSocket messages._

### Schema Changes

_List any changes to schemas in `schemas/v0.1/`. Include the new/modified fields with types and descriptions._

### TypeScript Interface Changes

_If applicable, list changes to exported types in `@eep-dev/gates`._

### State Machine / Lifecycle Impacts

_If the change affects a state machine (e.g., commerce negotiation, subscription lifecycle, session lifecycle), include a before/after diagram._

---

## Rationale

_Why this specific design? What alternatives were considered and rejected?_

Include:
- Design alternatives considered
- Trade-offs made
- Prior art (reference any relevant standards or protocols)

---

## Backward Compatibility

_Detail any breaking changes and migration paths._

| Impact Area | Breaking? | Migration Path |
|---|---|---|
| Gate proof submissions | Yes/No | _describe_ |
| Event consumers | Yes/No | _describe_ |
| Publishers | Yes/No | _describe_ |
| JSON schemas | Yes/No | Schema version bump if breaking |

If fully backward-compatible, state: "This EEIP introduces no breaking changes."

---

## Security Considerations

_Any new attack surfaces, trust assumptions, or cryptographic considerations introduced by this change._

At minimum, address:
- Does this change affect signature verification?
- Does this change affect replay attack prevention?
- Does this introduce new rate-limiting concerns?
- Does this affect privacy or data minimization?

---

## Reference Implementation

_Link to or describe a reference implementation. EEIPs cannot reach `Final` status without at least 2 independent implementations._

- **Repository:** _URL_
- **Branch/PR:** _URL_
- **Tests:** _URL_ (tests MUST be included)
- **Documentation:** _URL_

---

## Test Vectors

_Provide concrete, copy-pasteable test inputs and expected outputs. This is required for protocol-level EEIPs._

```json
// Input
{
  "example_field": "example_value"
}

// Expected output
{
  "result": "expected_result"
}
```

---

## Copyright

This EEIP is placed in the public domain under [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/).
