# EEP Monetization Guide

This guide covers gates (access control), commerce (price negotiation), and service listings (marketplace).

## 1. Gated access

Gates let entities decide who gets access to what. You pick your own tier names and requirements instead of being stuck with a fixed set.

### Define your gate config

```json
{
  "default_tier": "public",
  "tiers": {
    "public": {
      "requirements": [],
      "access": ["profile.summary", "profile.capabilities"]
    },
    "verified_agents": {
      "label": "Verified Agents",
      "requirements": [
        { "type": "trust", "min_score": 50 }
      ],
      "access": ["profile.*", "events.public"]
    },
    "academic": {
      "label": "Academic Access",
      "requirements": [
        { "type": "credential", "credential_type": "AcademicAffiliation" }
      ],
      "access": ["profile.*", "content.papers.*"]
    },
    "premium": {
      "label": "Premium",
      "requirements": [
        { "type": "payment", "amount": 5, "currency": "usd", "per": "month",
          "payment_methods": ["https://pay.example.com/checkout/premium"] }
      ],
      "access": ["*"]
    }
  }
}
```

### Handle 402 responses

When an agent asks for a gated resource without proof, your platform returns HTTP 402:

```json
{
  "error": "access_restricted",
  "resource": "content.papers.full_text",
  "current_tier": "public",
  "required_tier": "academic",
  "unmet_requirements": [
    {
      "type": "credential",
      "resolution_hint": "Verifiable Credential required: AcademicAffiliation"
    }
  ]
}
```

The agent gets back what's missing and what it can do about it. No guessing.

### Write a ProofVerifier

`@eep-dev/gates` checks proof **structure** (right fields, not expired). Your platform checks proof **semantics** (is this token real):

```typescript
import { ProofVerifierRegistry, resolveAccess, build402Response } from '@eep-dev/gates';

const registry = new ProofVerifierRegistry();

registry.register({
  supportedTypes: ['payment'],
  verify: async (proof, requirement) => {
    // Ask Stripe (or whatever you use) if the token is good
    return await stripe.paymentIntents.retrieve(proof.token).then(pi => pi.status === 'succeeded');
  },
});

// In your route handler
const result = await resolveAccess(proofs, gateConfig, resourcePath, registry);
if (!result.granted) {
  return c.json(await build402Response(gateConfig, resourcePath, proofs), 402);
}
```

## 2. Requirement types

Combine any of these. All must be satisfied (AND logic).

| Type | What it does |
|------|-------------|
| `payment` | Paid access: subscription, per-request, one-time |
| `trust` | Agent needs a minimum trust score |
| `identity` | Verified identity (DID, email, KYC) |
| `connection` | Social graph: follower, mutual, etc. |
| `credential` | Academic, professional, or government credentials |
| `capability` | Agent must declare specific capabilities |
| `allowlist` | Only listed DIDs get in |
| `reciprocal` | The agent must give you equivalent access back |
| `x-*` | Make your own: `x-dao-membership`, `x-nft-holder`, etc. |

## 3. Commerce negotiation

If a service is negotiable, agents and entities trade offers over WebSocket:

```
Agent:  { type: "commerce", action: "offer",    data: { negotiation_id: "neg_abc", service: "consulting", pricing: { model: "fixed", amount: 50, currency: "usd" } } }
Entity: { type: "commerce", action: "counter",  data: { negotiation_id: "neg_abc", pricing: { model: "fixed", amount: 75, currency: "usd" } } }
Agent:  { type: "commerce", action: "accept",   data: { negotiation_id: "neg_abc" } }
Entity: { type: "commerce", action: "invoice",  data: { negotiation_id: "neg_abc", invoice: { invoice_id: "inv_01", amount: 75, currency: "usd" } } }
Agent:  { type: "commerce", action: "receipt",  data: { negotiation_id: "neg_abc", receipt: { receipt_id: "rcpt_01", payment_proof: { type: "payment", token: "tok_stripe_xxx" } } } }
Entity: { type: "commerce", action: "complete", data: { negotiation_id: "neg_abc" } }
```

The state machine enforces valid transitions. You can't jump from `open` to `paid` or go backwards from `rejected`.

## 4. Service listings

Entities publish a machine-readable catalog of what they offer:

```json
{
  "entity_did": "did:web:example.com:u:alice",
  "services": [
    {
      "id": "svc_consultation_30",
      "name": "30-Minute Strategy Consultation",
      "category": "consulting",
      "tags": ["ai", "strategy", "product"],
      "pricing": { "model": "fixed", "amount": 75, "currency": "usd" },
      "delivery": "realtime",
      "availability": { "type": "schedule", "timezone": "America/New_York" },
      "negotiable": true,
      "status": "active"
    }
  ]
}
```

Agents find these through the same EEP endpoints they already use. No separate marketplace needed.

## 5. Access patterns

Wildcard syntax for matching resources to tiers:

| Pattern | Matches |
|---------|---------|
| `*` | Everything |
| `profile.*` | `profile.bio`, `profile.skills`, `profile.contact.email` |
| `content.papers.*` | `content.papers.abstract`, `content.papers.full_text` |
| `events.public` | Only `events.public`, nothing else |

## 6. x402 Native Payment Integration

For microtransaction-heavy workflows where traditional payment providers add too much overhead, EEP natively supports the [x402 protocol](https://x402.org) — an HTTP-native payment rail built on EIP-712 and USDC.

### Configure an x402 payment tier

```json
{
  "default_tier": "public",
  "tiers": {
    "public": {
      "requirements": [],
      "access": ["profile.summary"]
    },
    "x402_access": {
      "label": "Pay-per-request (x402/USDC)",
      "requirements": [
        {
          "type": "payment",
          "amount": 1,
          "currency": "USDC",
          "per": "request",
          "x402": {
            "enabled": true,
            "facilitator_url": "https://x402.org/facilitator",
            "payment_rails": ["x402/usdc"],
            "network": "base"
          }
        }
      ],
      "access": ["data.finance.*"]
    }
  }
}
```

### Submit an x402 proof

Instead of a traditional payment token, agents include an EIP-712 signed payload:

```typescript
import { resolveAccess } from '@eep-dev/gates';
import { ProofVerifierRegistry } from '@eep-dev/gates';

const proofs = [
  {
    type: 'payment',
    x402_payload: {
      payload: JSON.stringify({ from: agentAddress, to: entityAddress, value: 1_000_000 }), // 1 USDC
      signature: await wallet.signTypedData(eip712Domain, eip712Types, payloadData),
      network: 'base',
    },
  },
];

const registry = new ProofVerifierRegistry();
registry.register({
  supportedTypes: ['payment'],
  verify: async (proof) => {
    if (proof.type !== 'payment' || !proof.x402_payload) return false;
    const response = await fetch('https://x402.org/facilitator/verify', {
      method: 'POST',
      body: JSON.stringify(proof.x402_payload),
    });
    return (await response.json()).settled === true;
  },
});

const result = await resolveAccess(proofs, gateConfig, 'data.finance.bloomberg_daily', registry);
```

### Proof verification flow

1. `@eep-dev/gates` validates the `x402_payload` structure (non-empty payload, valid hex signature, network present).
2. Your `ProofVerifier` calls the x402 facilitator to confirm on-chain settlement:

```typescript
registry.register({
  supportedTypes: ['payment'],
  verify: async (proof) => {
    if (proof.type === 'payment' && proof.x402_payload) {
      const response = await fetch('https://x402.org/facilitator/verify', {
        method: 'POST',
        body: JSON.stringify(proof.x402_payload),
      });
      return (await response.json()).settled === true;
    }
    // Fall back to traditional token check
    return await stripe.verify(proof.token);
  },
});
```

x402 is particularly well-suited to high-frequency M2M scenarios where agents make thousands of micropayments per day without human involvement.
