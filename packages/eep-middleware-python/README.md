# `eep-middleware-python`

Python middleware for integrating **EEP** into FastAPI, Flask, or Django: framework-agnostic **`EEPServer`**, auth/DB/event-bus adapters, and router helpers.

## Install

From the EEP monorepo:

```bash
cd EEP/packages/eep-middleware-python
pip install -e .
```

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
