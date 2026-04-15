# EEP adopters

This file lists organizations and projects that **publicly** use or integrate the Entity Engagement Protocol (EEP). It is optional and community-maintained.

## How to be listed

Open a pull request that adds a row to the table below (or a short subsection under **Integrations**) with:

- **Name** — product, organization, or open-source project.
- **Link** — homepage or public documentation.
- **Usage** — one line on how EEP is used (publisher, subscriber, middleware, evaluation, etc.).
- **Contact** (optional) — public email or GitHub handle for questions.

Commercial and internal-only deployments may stay anonymous; there is no requirement to appear here.

## Adopters

| Name | Link | Usage |
|------|------|--------|
| *— Add yours via PR —* | | |

## Integrations

| Name | Link | Notes |
|------|------|--------|
| *— Libraries, hosts, or gateways that support EEP —* | | |

## Adoption metrics (template)

Teams tracking rollout can copy the following checklist into their own docs or dashboards (no standard format is required):

- [ ] Layer 1 manifest deployed (`/.well-known/eep.json`) and discoverable.
- [ ] At least one Layer 2 surface (SSE or webhooks) exercised in staging.
- [ ] Gate flow tested (`402` / proofs) for the intended tier.
- [ ] Compliance or smoke checks run (`@eep-dev/compliance-cli`, CI, or equivalent).

For automation and CLI flows, see [docs/guides/how-to-setup-cli.md](./docs/guides/how-to-setup-cli.md) and the [reference implementation](./examples/eep-reference-implementation/README.md).
