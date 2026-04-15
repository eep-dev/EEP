# Python Gate Subscriber Example

Demonstrates the full EEP gate subscriber flow from Python: discovering gate configs, handling 402 (Access Restricted) responses, submitting proofs, and accessing gated resources.

## Prerequisites

A running EEP gate publisher (e.g., [`node-gate-publisher`](../node-gate-publisher)):

```bash
cd ../node-gate-publisher
npm install && npx tsx server.ts
```

## Setup

```bash
pip install -r requirements.txt
```

## Run

```bash
# Default: connects to http://localhost:3002
python client.py

# Custom publisher URL
EEP_PUBLISHER_URL=https://publisher.example python client.py
```

## What it demonstrates

1. **Gate Discovery** — `GET /eep/gates/:did` to learn tier structure and requirements
2. **402 Handling** — Attempt gated resource, parse the 402 response (unmet requirements, available tiers)
3. **Proof Submission** — Build proofs based on the 402 requirements and retry with `X-EEP-Proofs` header
4. **Service Catalog** — `GET /eep/services/:did` to browse entity's service listings

## Flow Diagram

```
┌──────────────┐     GET /eep/gates/:did     ┌──────────────┐
│   Subscriber │ ──────────────────────────── │   Publisher   │
│   (Python)   │ ◀──── 200 + gate config ──── │   (any lang) │
│              │                              │              │
│              │  GET /eep/content/:did/path  │              │
│              │ ──────────────────────────── │              │
│              │ ◀──── 402 + requirements ─── │              │
│              │                              │              │
│   build      │  GET + X-EEP-Proofs header   │              │
│   proofs ──▶ │ ──────────────────────────── │              │
│              │ ◀──── 200 + content ──────── │              │
└──────────────┘                              └──────────────┘
```

## License

Apache-2.0
