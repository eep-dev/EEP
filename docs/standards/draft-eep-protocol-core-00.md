# draft-eep-protocol-core-00

**Internet-Draft**  
**EEP Core Protocol**  
**Intended status:** Informational  
**Expires:** October 2026  

**Authors:** EEP Core Team  
**Email:** hello@eep.dev  

## Abstract

The Entity Engagement Protocol (EEP) defines how digital entities publish real-time state change events and how authorized subscribers receive them. It uses three transport layers: state resolution (REST), signal stream (SSE and Webhooks), and network pulse (WebSockets). EEP supports the agentic web, where AI agents participate directly in digital interactions.

This document describes the core normative wire format, event envelope, discovery mechanisms, and conformance levels.

See the full specification at https://github.com/eep-dev/EEP/blob/main/docs/current/SPECIFICATION.md for complete normative text, schemas, and reference implementation.

## Status of This Memo

This Internet-Draft is submitted in full conformance with the provisions of BCP 78 and BCP 79.

Internet-Drafts are working documents of the Internet Engineering Task Force (IETF). Note that other groups may also distribute working documents as Internet-Drafts. The list of current Internet-Drafts is at https://datatracker.ietf.org/drafts/current/.

Internet-Drafts are draft documents valid for a maximum of six months and may be updated, replaced, or obsoleted by other documents at any time. It is inappropriate to use Internet-Drafts as reference material or to cite them other than as "work in progress."

This Internet-Draft will expire on October 2026.

## Copyright Notice

Copyright (c) 2026 IETF Trust and the persons identified as the document authors. All rights reserved.

This document is subject to BCP 78 and the IETF Trust's Legal Provisions Relating to IETF Documents (https://trustee.ietf.org/license-info) in effect on the date of publication of this document. Please review these documents carefully, as they describe your rights and restrictions with respect to this document.

## Table of Contents

1. Introduction
2. Terminology
3. Layer 1: State Resolution
4. Layer 2: Signal Stream
5. Event Envelope
6. Discovery
7. Conformance Levels
8. Security Considerations
9. IANA Considerations
10. Normative References

(Full content mirrors EEP/docs/current/SPECIFICATION.md sections; this skeleton is for IETF submission process. See the normative specification for wire format details.)

## 1. Introduction

EEP standardizes push-based verifiable communication for agents. See the full specification for normative requirements.

## Normative References

- [EEP-SPEC] "Entity Engagement Protocol Specification v0.1", EEP Core Team, April 2026, <https://github.com/eep-dev/EEP/blob/main/docs/current/SPECIFICATION.md>.

## Security Considerations

See the full specification's security section and WHITEPAPER.tex for detailed analysis (replay protection, HMAC, DID cache, fail-closed defaults, PQC hybrid policy).

---

This is a starting skeleton for `draft-eep-protocol-core-00`. Submit via IETF datatracker after community review. Update with feedback per the roadmap in docs/standards/ietf-w3c-readiness-roadmap.md.
