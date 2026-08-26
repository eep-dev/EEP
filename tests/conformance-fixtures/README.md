# EEP conformance fixtures

This directory holds **bytes-on-the-wire test vectors** for the Entity
Engagement Protocol. Implementations of EEP — in any language — can run
these fixtures *offline*, with no live publisher, to verify that they
parse, validate, sign, and gate the same way the reference packages do.

The fixtures are also released as a versioned tarball
(`eep-conformance-vectors-vX.Y.Z.tar.gz`) attached to every GitHub
Release of the spec, so a downstream implementor can pin a fixture
version independently of the reference packages.

## Layout

```
tests/conformance-fixtures/
├── README.md                ← this file
├── manifest.json            ← machine-readable index of every fixture
├── discovery/               ← /.well-known/eep.json, manifest, Link header, DNS TXT
├── envelope/                ← EEP/CloudEvents event envelope shapes
├── signature/               ← HMAC sign + verify, replay window, multi-signature
├── gates/                   ← 402 / 403 / 429 / 451 response shapes; access resolution
└── subscription/            ← subscribe request shapes, SSRF rejection, leases, filters
```

Every fixture directory contains either:

- **A simple JSON pair** — `<name>.input.json` + `<name>.expected.json`,
  for fixtures where the input is a JSON document and the expected
  outcome is a JSON document (validity, parsed shape, error code).
- **A signed-payload bundle** — a directory containing `body.txt`
  (raw signed bytes), `headers.json` (request headers including
  `webhook-id` / `webhook-timestamp` / `webhook-signature`),
  `secret.txt` (the test secret), and `expected.json` (`{"valid": true|false, "reason": ...}`).
- **A static bundle** (`shape: "bundle"`) — a directory of static files served
  by a single host (e.g. `discovery/crosswalk-host/`). Used for informative
  fixtures where multiple files coexist; `expected.json` summarises what a
  validator should see.

Some fixtures are deliberately *invalid* — they encode bytes that
implementations MUST reject. The expected outcome makes the rejection
explicit (e.g. `{"valid": false, "reason": "expired_timestamp"}`).

## How to consume the fixtures

### From `@eep-dev/compliance-cli`

```bash
npx @eep-dev/compliance-cli --fixtures ./tests/conformance-fixtures
```

The CLI reads `manifest.json`, runs each fixture against the local
package code, and prints a pass/fail summary. No network is required.
Add `--target https://...` to also probe a live implementation.

### From your own implementation

```python
import json, pathlib

root = pathlib.Path("tests/conformance-fixtures")
manifest = json.loads((root / "manifest.json").read_text())

for entry in manifest["fixtures"]:
    fixture_dir = root / entry["path"]
    # ... feed the fixture into your implementation under test ...
```

Implementors are expected to map the fixture *category* to the relevant
internal API (e.g. `signature/` fixtures feed your HMAC verifier).

## Test secrets in this directory

Every secret stored in this directory is **for testing only**. They are
deliberately well-known so that fixtures are reproducible across
implementations. Never reuse these strings in production. They appear in
`secret.txt` files and are also enumerated in
[SECRETS.md](./SECRETS.md).

## Adding a new fixture

1. Create the input + expected files under the appropriate category.
2. Add an entry to `manifest.json` (keep it sorted by `id`).
3. If the fixture exercises a normative requirement, link it from the
   relevant section of `docs/current/SPECIFICATION.md` via the
   `spec_section` manifest field.
4. Open a PR. The CI runs every fixture against every reference
   implementation; both must agree before the PR can merge.

## Versioning

The fixtures directory is versioned together with the spec, in
lock-step. The schema version each fixture targets is named in the
fixture's `manifest.json` entry under `schema_version`. Removing or
materially changing a fixture is a *breaking* change to consumers and
follows the same EEIP rules as a spec change.

## Status

Fixtures are progressively expanding. The current set covers the
**Core** conformance tier. Standard and Full tier fixtures are tracked
in [ROADMAP.md](../../ROADMAP.md).
