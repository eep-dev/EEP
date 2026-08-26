---
title: "EEP Core Protocol"
abbrev: "EEP-Core"
docname: draft-eep-protocol-core-00
category: info
ipr: trust200902
area: applications
workgroup: ""
keyword: [agents, webhooks, sse, websockets, did, verifiable-credentials, cloudevents, agentic-web]
stand_alone: yes
pi: [toc, sortrefs, symrefs]

author:
  -
    ins: U. Cekmez
    name: Ugur Cekmez
    organization: "Munich University of Digital Technologies and Applied Sciences"
    email: hello@eep.dev

informative:
  EEP-SPEC:
    title: "Entity Engagement Protocol Specification v0.1"
    target: https://github.com/eep-dev/EEP/blob/main/docs/current/SPECIFICATION.md
    author:
      -
        organization: "The EEP Authors and Contributors"
    date: 2026

normative:
  RFC2119:
  RFC8174:
  RFC3986:
  RFC3339:
  RFC7725:
  RFC9110:
  W3C.SSE:
    title: "Server-Sent Events"
    target: https://www.w3.org/TR/eventsource/
    author:
      -
        organization: "World Wide Web Consortium"
    date: 2009
  W3C.DID:
    title: "Decentralized Identifiers (DIDs) v1.0"
    target: https://www.w3.org/TR/did-core/
    author:
      -
        organization: "World Wide Web Consortium"
    date: 2022
  W3C.VC:
    title: "Verifiable Credentials Data Model v2.0"
    target: https://www.w3.org/TR/vc-data-model-2.0/
    author:
      -
        organization: "World Wide Web Consortium"
    date: 2025
  CLOUDEVENTS:
    title: "CloudEvents — Specification v1.0.2"
    target: https://github.com/cloudevents/spec
    author:
      -
        organization: "Cloud Native Computing Foundation (CNCF)"
    date: 2024
  STANDARD-WEBHOOKS:
    title: "Standard Webhooks"
    target: https://www.standardwebhooks.com/
    date: 2024

--- abstract

The Entity Engagement Protocol (EEP) describes how digital entities
publish real-time state-change events and how authorized subscribers
receive them. EEP defines three composable transport layers: state
resolution over HTTP REST, signal delivery over Server-Sent Events (SSE)
and Webhooks, and an optional bidirectional "network pulse" over
WebSockets. Events follow the CloudEvents v1.0.2 envelope; webhook
deliveries are signed using HMAC-SHA256 in alignment with the Standard
Webhooks convention. Optional access gates allow publishers to require
identity, credentials, payment, or signed agreements before serving an
event stream. EEP composes with — and does not replace — Decentralized
Identifiers (DID), Verifiable Credentials (VC), CloudEvents, and the
Model Context Protocol (MCP). This document specifies the Core
conformance tier; richer "Standard" and "Full" tiers are defined in the
companion specification at {{EEP-SPEC}}.

--- middle

# Introduction

The world wide web evolved around the assumption that the consumer of
a resource is either a human-driven browser or a backend service polling
on a custom schedule. Increasingly, the consumer is an autonomous agent
that needs to (1) discover an entity (person, organization, product,
agent), (2) subscribe to changes in that entity's state, (3) verify the
authenticity of received events, and (4) interact with optional
identity, credential, payment, or agreement gates that the publisher may
require. Today every publisher solves these problems differently,
forcing each consumer to write a bespoke integration.

EEP standardizes the four problems above as a single, layered protocol.
The Core tier covered by this document is sufficient to discover an
entity and receive signed events from it; richer tiers and sector
extensions are described in the companion specification.

# Terminology

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT",
"SHOULD", "SHOULD NOT", "RECOMMENDED", "NOT RECOMMENDED", "MAY", and
"OPTIONAL" in this document are to be interpreted as described in
BCP 14 {{RFC2119}}{{RFC8174}} when, and only when, they appear in all
capitals, as shown here.

The following terms have specific meaning in EEP:

Entity:
: An identifiable subject in the EEP universe — a person, organization,
  agent, product, listing, or other addressable thing — denoted by a DID
  {{W3C.DID}}.

Publisher:
: A service that exposes one or more entities and emits state-change
  events about them.

Subscriber:
: A consumer (typically an automated agent) that receives events from
  one or more publishers.

Pulse channel:
: An optional bidirectional WebSocket channel for low-latency commands
  and negotiation.

# Layer 1: State Resolution {#layer-1}

A conforming publisher MUST expose a discovery document at
`/.well-known/eep.json` per {{RFC9110}}. The document MUST be a JSON
object conforming to the `eep-manifest.json` schema in {{EEP-SPEC}}.
The fields relevant to the Core tier are:

<!-- BEGIN manifest-fields (checked by scripts/check-draft-schema-parity.mjs) -->
| Field | Type | Required | Description |
|---|---|---|---|
| `did` | string | yes | An absolute DID URI per {{W3C.DID}} identifying the publisher. |
| `eep_version` | string | yes | The EEP version supported, e.g. `"0.1"`. |
| `layers` | object | yes | Endpoint URLs per layer; see below. |
| `supported_content_types` | array | yes | Media types the Layer 1 entity endpoint can serve, e.g. `["application/json", "text/markdown"]`. |
| `pqc_ready` | boolean | yes | Whether the publisher can verify post-quantum signature algorithms. |
| `x402_enabled` | boolean | yes | Whether the publisher supports HTTP 402 payment gating. |
| `gates_url` | string (URI) | no | Absolute https URL of the gate configuration document. |
| `services_url` | string (URI) | no | Absolute https URL of the service catalog. |
| `updated_at` | string | no | RFC 3339 timestamp of the last manifest change. |
<!-- END manifest-fields -->

The `layers` object carries the endpoint URLs:

| Member | Type | Required | Description |
|---|---|---|---|
| `layer1` | string (URI) | yes | Absolute https URL of the Layer 1 entity resolution endpoint. |
| `layer2_sse` | string (URI) | no | Absolute https URL of the SSE stream. |
| `layer2_webhook` | string (URI) | no | Absolute https URL for subscription creation. |
| `layer3_ws` | string (URI) | no | Absolute wss URL of the pulse channel, when supported. |

A publisher MUST populate at least one of `layers.layer2_sse` or
`layers.layer2_webhook`, because {#layer-2} is the only mandatory
transport.

Subscribers MUST be able to fetch this document with a single HTTPS
GET. Publishers MUST serve it over TLS.

The full manifest surface — including `signing_algorithms`,
`conformance_credential`, `reputation`, `data_residency` and the
discovery hints — is specified in {{EEP-SPEC}} and constrained by
`eep-manifest.json`. This document restates only what a Core-tier
implementation must produce; it does not redefine the schema, and
`scripts/check-draft-schema-parity.mjs` in the EEP repository fails the
build if the table above drifts from it.

# Layer 2: Signal Stream {#layer-2}

The signal stream is the only mandatory transport. A Core-conformant
publisher MUST implement at least one of:

- Server-Sent Events ({{W3C.SSE}}) at `layers.layer2_sse`, OR
- Outbound HTTPS Webhooks signed per {#signing}.

## Subscription

A subscriber MAY register for events by POSTing to
`layers.layer2_webhook` a JSON body conforming to the
`subscription.request.json` schema in {{EEP-SPEC}}. Required fields are
`source_did`, `event_types`, and `delivery_method`; webhook
subscriptions also require `delivery_url`.

Publishers MUST validate `delivery_url` against
{{!RFC1918}} / {{!RFC5735}} address ranges and reject any URL that
resolves to a private, link-local, loopback, or cloud-metadata address
(see {{security}}).

## Event envelope {#envelope}

EEP events use the CloudEvents v1.0.2 envelope {{CLOUDEVENTS}},
constrained by the `event.envelope.json` schema in {{EEP-SPEC}}. The
core attributes `specversion`, `id`, `source`, `type`, `time` and
`datacontenttype` are all REQUIRED.

In addition, EEP defines the following extension attribute for the Core
tier:

- `eep_version` (string, REQUIRED): the spec version the publisher used,
  matching the `EEP-Version` response header.

Further `eep_`-prefixed extension attributes (`eep_subscription_id`,
`eep_trust_score`, `eep_actor_type`, `eep_tier` and others) are defined
in {{EEP-SPEC}} for the Standard and Full tiers.

> **Editor's note (to be resolved before submission).** CloudEvents
> v1.0.2 restricts context attribute names to lowercase ASCII letters
> and digits, which excludes the underscore. The attribute names above
> are the ones shipped and deployed today, but they do not satisfy that
> rule, and the divergence becomes load-bearing in CloudEvents *binary*
> content mode, where attributes are carried as `ce-`-prefixed HTTP
> headers. Options are (a) rename to `eepversion` and friends with a
> deprecation window, or (b) carry the underscore names only in
> structured mode and define a binary-mode mapping. This draft
> deliberately documents what exists rather than a name no
> implementation emits.

EEP event types MUST follow reverse-DNS naming, e.g.
`com.example.entity.updated`. Event types MAY use a trailing wildcard
in subscriptions (e.g. `com.example.entity.*`).

## Signing {#signing}

Webhook deliveries MUST be signed using HMAC-SHA256 in alignment with
{{STANDARD-WEBHOOKS}}. The signed content is the concatenation
`{webhook-id}.{webhook-timestamp}.{raw-body}`, where the three values
are taken from the headers `webhook-id`, `webhook-timestamp`, and the
HTTP body bytes respectively. The signature header takes the form
`webhook-signature: v1,<base64-hmac>`. Multiple space-separated
signatures MAY appear; subscribers MUST accept the message if any one
of them verifies.

Subscribers:

- MUST reject deliveries whose `webhook-timestamp` is more than 60
  seconds older or newer than the subscriber's wall clock.
- MUST use a constant-time comparison to verify signatures.
- MUST refuse signing secrets shorter than 16 octets.

# Conformance Levels

This document defines only the **Core** tier. The richer **Standard**
and **Full** tiers, including gate types, commerce negotiation, and the
WebSocket pulse channel, are defined in {{EEP-SPEC}}.

A Core-conformant implementation MUST support {#layer-1} and the SSE or
Webhook subset of {#layer-2}, including signing per {#signing}.

# Security Considerations {#security}

EEP inherits the threat model of any push-based delivery protocol.
Implementations MUST take the following protections:

1. **SSRF**: validate every subscriber-supplied delivery URL against
   the address ranges in {{!RFC1918}} / {{!RFC5735}} and reject
   localhost and cloud-metadata aliases. Re-validate the resolved IP
   immediately before connect to defend against DNS rebinding.
2. **Replay**: enforce the 60-second timestamp window in {#signing}
   and a server-side nonce store on `webhook-id` for at least 60
   seconds.
3. **Key handling**: never log signing secrets or DID private keys;
   redact in audit pipelines.
4. **Revocation**: subscribers MUST honour `trust.signal.revoked`
   events from the canonical EEP registry and MUST check DID Documents
   for `doc.revoked` before accepting a proof.
5. **Rate limits**: publishers MUST emit `Retry-After`,
   `X-RateLimit-Remaining`, and `X-RateLimit-Reset` on 429 responses.
6. **Legal restrictions**: publishers MUST use HTTP 451
   ({{RFC7725}}) when an event is blocked specifically by law in the
   subscriber's jurisdiction.

# IANA Considerations

This document defines:

- **A new well-known URI** `/.well-known/eep.json` to be registered per
  the procedure in {{!RFC8615}}. The intended use is publisher
  discovery in EEP.
- **CloudEvents extension attributes** `eepversion` and `eepdelivery`
  to be registered in the CloudEvents Attributes registry.

# Privacy Considerations

EEP allows publishers to expose state changes to authenticated
subscribers; published data SHOULD be classified per the publisher's
privacy policy (see `operator.privacy-policy.json` in {{EEP-SPEC}}).
Subscribers SHOULD NOT cache event bodies beyond what is required to
deliver them to their downstream consumer; long-term retention of
events that include personally-identifying data is governed by the
publisher's stated retention policy.

--- back

# Acknowledgements

The authors thank the EEP core team, BeneluxSoft, MUDT, and the early
adopters listed in `registry/adopters.json`.
