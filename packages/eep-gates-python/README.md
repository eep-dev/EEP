# eep-gates (Python)

Python port of [`@eep-dev/gates`](../../packages/@eep-dev/gates) — access control, commerce negotiation, and service discovery for the Entity Engagement Protocol.

## Install

```bash
pip install -e .
```

## Usage

```python
from eep_gates import (
    parse_gate_config,
    resolve_access,
    build_402_response,
    ProofVerifier,
    ProofVerifierRegistry,
)

# Parse gate config
config = parse_gate_config({
    "default_tier": "public",
    "tiers": {
        "public": {"requirements": [], "access": ["events.*"]},
        "premium": {
            "requirements": [{"type": "payment", "amount": 10, "currency": "usd", "per": "month"}],
            "access": ["*"],
        },
    },
})

# Resolve access
class PaymentVerifier(ProofVerifier):
    @property
    def supported_types(self):
        return ["payment"]

    async def verify(self, proof, requirement):
        return proof.get("type") == "payment" and bool(proof.get("token"))


registry = ProofVerifierRegistry()
registry.register(PaymentVerifier())
result = await resolve_access(proofs, config, "content.papers", verifier_registry=registry)

if not result.granted:
    resp = await build_402_response(config, "content.papers", proofs)
    return JSONResponse(resp, status_code=402)
```

### Tier specificity (default-tier wildcard override)

When resolving a specific resource, a more-specific gated tier always wins over
a broader default-tier wildcard. With the common shape below, an agent with no
proofs is denied `content.premium.*` (a 402 carrying the gated tier's unmet
requirements) even though the default `content.*` pattern covers it, while
plain `content.*` resources stay public:

```python
config = {
    "default_tier": "public",
    "tiers": {
        "public": {"requirements": [], "access": ["content.*", "profile.*"]},
        "paid":   {"requirements": [{"type": "trust", "min_score": 20}], "access": ["content.premium.*"]},
    },
}

await resolve_access([], config, "content.premium.x")   # granted=False, tier="public", unmet=[trust]
await resolve_access([], config, "content.blog.post")   # granted=True,  tier="public"
```

The default tier's grant is suppressed only when a gated (requirements-bearing)
tier matches the resource with an **equal-or-more-specific** access pattern. A
strictly more-specific default pattern keeps its grant, and resources the
default tier does not cover at all fail closed. The helpers
`pattern_specificity`, `best_specificity_for`, and
`default_tier_overridden_by_gated_tier` are exported for callers that
re-implement the hot path.

## Modules

| Module | Description |
|--------|-------------|
| `models` | Pydantic data models (requirements, proofs, tiers, commerce) |
| `gate_config` | Parse, validate, and serialize gate configurations |
| `resource_matcher` | Wildcard pattern matching for access control |
| `access_resolver` | Determine tier access from proofs |
| `proof_validator` | Structural validation + verifier registry |
| `http_402` | Build spec-compliant 402 responses |
| `commerce` | Negotiation state machine + pricing validation |
| `service_listing` | Service catalog and review validation |

## Tests

```bash
pip install -e ".[dev]"
pytest
```

## License

Apache-2.0
