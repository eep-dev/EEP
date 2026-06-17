# `eep-middleware-python`

Python middleware for integrating **EEP** into FastAPI, Flask, or Django: framework-agnostic **`EEPServer`**, auth/DB/event-bus adapters, and router helpers.

## Install

From the EEP monorepo (install the sibling packages this middleware depends on first,
so the `eep-gates` / `eep-validator` requirements resolve locally instead of from PyPI):

```bash
cd EEP/packages
pip install -e ./eep-gates-python -e ./eep-validator-python
pip install -e ./eep-middleware-python
```

`eep-middleware` depends on **`eep-gates`** (gate resolution + 402 responses) and
**`eep-validator`** (SSRF checks for webhook callbacks), mirroring the TypeScript
`@eep-dev/middleware` dependency on `@eep-dev/gates` and `@eep-dev/validator`.

Or add as a path dependency in `pyproject.toml`:

```toml
[tool.uv.sources]
eep-middleware-python = { path = "../eep-middleware-python", editable = true }

[project.dependencies]
eep-middleware-python = "*"
```

Requires Python 3.10+ (see `pyproject.toml`).

## Quickstart (FastAPI)

```python
import os
from fastapi import FastAPI
from eep_middleware import EEPServer
from eep_middleware.fastapi import create_eep_router

app = FastAPI()

server = EEPServer(
    base_url=os.environ.get("EEP_BASE_URL", "https://api.example.com"),
    did=os.environ.get("EEP_DID", "did:web:example.com"),
)
router = create_eep_router(server)
app.include_router(router, prefix="")
```

Adjust **`base_url`** / **`did`** to match your deployment and `eep-setup.json` **`identity`**.

## Quickstart (Flask)

```python
import os
from flask import Flask
from eep_middleware import EEPServer
from eep_middleware.flask import create_eep_blueprint

app = Flask(__name__)
server = EEPServer(
    base_url=os.environ.get("EEP_BASE_URL", "https://api.example.com"),
    did=os.environ.get("EEP_DID", "did:web:example.com"),
)
app.register_blueprint(create_eep_blueprint(server))
```

## Django

Use **`get_eep_urlpatterns(server)`** from `eep_middleware.django` and include them in your URLconf (see package source for signature).

## Gated resources & proof verification

`server.resolve_gated_resource(resource, headers)` resolves access against the
configured `gate_config` using **`eep_gates.resolve_access`** with
`strict_semantic_verification=True`. It fails closed: a requirement is only
satisfied when a registered **proof verifier** confirms the proof. Without a
verifier for a requirement type, that requirement stays unmet and the caller
gets a spec-compliant **402** body from `build_402_response`.

Register verifiers through the constructor:

```python
from eep_gates import ProofVerifier

class PaymentVerifier(ProofVerifier):
    @property
    def supported_types(self): return ["payment"]
    async def verify(self, proof, requirement) -> bool:
        return await my_settlement_lookup(proof.get("token"))  # real check

server = EEPServer(
    base_url="https://api.example.com",
    did="did:web:example.com",
    gate_config=my_gate_config,
    proof_verifiers=[PaymentVerifier()],
)
```

> There is **no** built-in "accept any token" shortcut. Earlier drafts granted
> premium access to a hard-coded placeholder token; that backdoor has been removed.

Webhook subscriptions (`POST /eep/subscribe`, `delivery_method: "webhook"`)
require a `delivery_url`, which is validated with **`eep_validator.validate_ssrf`**
before it is stored — callbacks to private / loopback / link-local addresses are
rejected with a 400.

## Adapters

- **Auth:** `JWTAuthAdapter`, `APIKeyAuthAdapter`
- **DB:** `InMemoryDBAdapter`, `PostgresDBAdapter`
- **Event bus:** `InMemoryEventBusAdapter`, `RedisEventBusAdapter`

## After `setup-cli`

See **[integrate-eep-after-setup-cli.md](../../docs/guides/integrate-eep-after-setup-cli.md)** for aligning generated **`eep-generated/`** artifacts with runtime options.

## Test

```bash
pytest
```

License: Apache-2.0.
