# EEP-ready verification (reports + CI)

Use **`@eep-dev/setup-cli`** `verify` to produce machine- and human-readable reports for a generated artifact directory.

## Outputs

After:

```bash
eep-setup verify --output ./eep-generated
```

you should have:

- `setup-report.json` — structured checks (used by automation)
- `setup-report.md` — short Markdown summary for operators

Paths can be overridden with **`--report-json`** and **`--report-md`**.

## What “EEP-ready” means (practical)

At minimum, **`verify` passes** (expected files exist under `--output`). This proves the **artifact bundle** is internally consistent for the setup-cli generator — not that your production deployment is complete (TLS, auth, data stores still belong to you).

## CI recipe (GitHub Actions style)

Run generation in a job, then fail if verification fails:

```yaml
- name: Generate EEP artifacts
  run: |
    cd packages/@eep-dev/setup-cli
    npm ci
    npm run build
    node dist/index.js apply --config "${{ github.workspace }}/eep-setup.json" --output "${{ github.workspace }}/eep-generated"

- name: Verify artifacts
  run: |
    cd packages/@eep-dev/setup-cli
    node dist/index.js verify --output "${{ github.workspace }}/eep-generated"
```

Commit **`eep-setup.json`**; either commit **`eep-generated/`** or regenerate in CI (pick one policy per repo).

## Badge (optional)

You can link to your latest **`setup-report.json`** in docs, or render a simple “EEP artifacts: verified” note in your README when CI passes (no official badge host required).
