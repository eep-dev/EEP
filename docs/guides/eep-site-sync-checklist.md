# eep-site sync checklist (manual)

The marketing and docs site lives in a **separate** repository: [eep-dev/eep-site](https://github.com/eep-dev/eep-site). After EEP repo changes, verify these items so visitors do not see drift.

## Version and status

- [ ] Spec version label matches [docs/current/SPECIFICATION.md](../current/SPECIFICATION.md) (e.g. v0.1).
- [ ] “Normative” vs “draft” wording matches [GOVERNANCE.md](../../GOVERNANCE.md) / README stability note.

## Packages and commands

- [ ] TypeScript package list matches `packages/@eep-dev/*` (including `middleware`, `mcp-bridge`, `setup-cli` if the site lists them).
- [ ] Python package names match `packages/eep-*-python/` (`pyproject.toml` `name` fields).
- [ ] Quick-setup / `npx` / `eep-setup` snippets match [how-to-setup-cli.md](./how-to-setup-cli.md) and [README.md](../../README.md).

## Discovery and schemas

- [ ] Schema filenames match [schemas/v0.1/](../../schemas/v0.1/) (including `event.envelope.json`).
- [ ] GEO / generative-retrieval text stays **informative** (not conformance), consistent with spec non-normative notes.

## Cross-links

- [ ] Links to raw spec or whitepaper use paths that exist on `main` (e.g. `docs/WHITEPAPER.tex`, `docs/current/SPECIFICATION.md`).
