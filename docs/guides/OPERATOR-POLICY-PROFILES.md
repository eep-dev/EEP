# EEP Operator Policy Profiles Guide

## Overview

Operator Policy Profiles are signed JSON documents that define an AI agent's behavioral parameters. They enable **autonomous decision-making within human-defined constraints** — the agent consults its policies before acting, rather than requiring constant human approval.

Two profile types exist:
- **Privacy Policy Profile** — controls what data the agent may share in `data_request` gates
- **Spending Policy Profile** — controls what the agent may pay in `payment` or auction gates

Schema: `schemas/v0.1/operator.privacy-policy.json` and `schemas/v0.1/operator.spending-policy.json`

---

## Privacy Policy Profile

### Purpose

When a publisher presents a `data_request` gate (§7, Whitepaper §7.3), the agent must decide whether to share the requested claims. The Privacy Policy Profile encodes the operator's intent, allowing the agent to:

- **Auto-approve** claims the operator freely consents to share
- **Escalate** claims requiring human confirmation
- **Refuse** claims that must never be shared

### Structure

```json
{
  "operator_did": "did:web:acme.ai",
  "version": "1",
  "issued_at": "2026-03-05T00:00:00Z",
  "freely_shareable_claims": ["org_type", "industry_sector", "use_case_category"],
  "human_confirmation_required": ["owner_email", "owner_name"],
  "unconditionally_refused": ["passport_number", "medical_records"],
  "max_retention_days": 90,
  "allow_unverified_publishers": false,
  "dpv_purposes_allowed": ["dpv:ResearchAndDevelopment", "dpv:ServiceProvision"],
  "operator_signature": "<EdDSA signature by operator_did>"
}
```

### Decision Logic

When the agent receives a `data_request` gate:

1. **Check publisher registration**: If `allow_unverified_publishers: false`, verify publisher's DID is registered on `eep.dev`
2. **Check purpose**: Verify each claim's `purpose` is in `dpv_purposes_allowed`
3. **Check retention**: Verify each claim's `retention_days` ≤ `max_retention_days`
4. **Check claim classification**:
   - In `unconditionally_refused` → reject entire gate, do not proceed
   - In `freely_shareable_claims` → approve autonomously
   - In `human_confirmation_required` → pause, surface to operator, wait for response
   - Not listed → treat as `human_confirmation_required` (default: cautious)
5. **Assemble VP** of approved claims and submit as `data_request` proof

### Signing the Policy

The operator signs using their DID private key (EdDSA over canonical JSON excluding `operator_signature`). This makes the policy tamper-evident and creates an auditable commitment.

---

## Spending Policy Profile

### Purpose

When an agent encounters a `payment` gate or `commerce.rfp.open` auction, the Spending Policy Profile enforces operator-defined financial limits, preventing runaway spending by autonomous agents.

### Structure

```json
{
  "operator_did": "did:web:acme.ai",
  "version": "1",
  "issued_at": "2026-03-05T00:00:00Z",
  "max_per_transaction": { "usd": 10.00, "eth": 0.005 },
  "max_per_hour": { "usd": 100.00 },
  "max_per_day": { "usd": 500.00 },
  "approved_chains": ["base", "solana"],
  "approved_recipient_categories": ["Full", "eep.dev-verified"],
  "require_recipient_conformance_level": "Standard",
  "require_on_chain_confirmation": true,
  "operator_signature": "<EdDSA signature>"
}
```

### Decision Logic

Before authorising any payment:

1. **Currency check**: Verify payment currency has a defined limit
2. **Per-transaction check**: `amount_requested` ≤ `max_per_transaction[currency]`
3. **Cumulative check**: `cumulative_1h + amount_requested` ≤ `max_per_hour[currency]`
4. **Chain check**: `payment_chain` in `approved_chains`
5. **Recipient check**: Publisher's EEP conformance level ≥ `require_recipient_conformance_level`
6. **Confirmation**: If `require_on_chain_confirmation: true`, wait for `min_confirmations` before marking payment complete

If any check fails: pause, escalate to operator, do not pay.

---

## Integration

### Runtime Loading

```typescript
import type { OperatorPrivacyPolicy, OperatorSpendingPolicy } from '@eep-dev/gates';

// Load and verify policy at agent startup
async function loadPolicies(agentDid: string): Promise<{
  privacy: OperatorPrivacyPolicy;
  spending: OperatorSpendingPolicy;
}> {
  // Load from local store or remote operator endpoint
  const privacy = await fetchPolicy<OperatorPrivacyPolicy>(`${agentDid}/privacy-policy`);
  const spending = await fetchPolicy<OperatorSpendingPolicy>(`${agentDid}/spending-policy`);
  
  // Verify operator signatures before trusting
  await verifyEdDSASignature(privacy.operator_did, privacy.operator_signature, privacy);
  await verifyEdDSASignature(spending.operator_did, spending.operator_signature, spending);
  
  return { privacy, spending };
}
```

### Pre-Gate Check Hook

```typescript
// Agent middleware — runs before any gate interaction
async function preGateHook(gate: DataRequestRequirement, policy: OperatorPrivacyPolicy): Promise<boolean> {
  for (const claim of gate.requested_claims) {
    if (policy.unconditionally_refused?.includes(claim.claim)) {
      return false; // Hard reject
    }
    if (policy.human_confirmation_required?.includes(claim.claim)) {
      const approved = await askOperator(claim);
      if (!approved) return false;
    }
    // In freely_shareable_claims → proceed
  }
  return true;
}
```

---

## Security Considerations

- **Policy staleness**: Re-validate policy signature on every agent restart. Regenerate if older than 30 days.
- **Policy downgrade**: Never accept an unsigned policy or one signed by a different DID than the operator.
- **Log all refusals**: Every `unconditionally_refused` decision must be logged for audit trail compliance (EU AI Act §22).
- **Delegation scope**: A delegation VC (§13) may further restrict a sub-agent's effective policy — always intersect delegation scope with operator policy, never widen it.
