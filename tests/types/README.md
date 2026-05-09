# Generated schema types

Files in this directory are produced by
`scripts/codegen-schema-types.mjs` from `schemas/v0.1/*.json`.

**Do not edit them by hand.** If the schemas change, regenerate:

```bash
node scripts/codegen-schema-types.mjs
```

CI runs the same script with `--check` and fails if the committed file
drifts from what regeneration would produce. This is the *drift gate*
described in [ROADMAP.md](../../ROADMAP.md) — it forces every schema
change to ship together with its generated type surface.

The generated files are not currently consumed by the published
packages; they exist as a guarantee that the hand-maintained types in
`@eep-dev/*` and `eep-*-python` are kept in step with the source of
truth (the JSON schemas).
