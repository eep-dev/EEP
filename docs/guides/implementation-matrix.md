# Implementation matrix (independent runtimes)

EEP is defined by the specification and conformance tooling; multiple implementations should interoperate at the protocol level.

| Runtime | Package / location | Notes |
|--------|---------------------|--------|
| Node.js | `@eep-dev/gates`, `@eep-dev/middleware`, reference API under `examples/eep-reference-implementation/node` | Primary reference HTTP surface + gates integration |
| Python | `eep-gates-python`, `eep-middleware-python`, reference API under `examples/eep-reference-implementation/python` | Parity-oriented ports and tests |
| Cross-check | `tests/cross-impl`, shared fixtures under `tests/parity` where applicable | Protocol-level HTTP tests |

When adding a new language runtime, target:

1. Same discovery + core routes as the reference (`/.well-known/eep.json`, health, gates/services when enabled).
2. Shared contract tests / fixtures where the repo provides them.
3. A short row in this table (PR).

See also **[testing-and-validation.md](./testing-and-validation.md)**.
