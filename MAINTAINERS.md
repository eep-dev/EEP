# EEP maintainers

This file lists the people responsible for the day-to-day stewardship of
the Entity Engagement Protocol (EEP). It is the source of truth for
[`.github/CODEOWNERS`](./.github/CODEOWNERS) and for governance roles
defined in [GOVERNANCE.md](./GOVERNANCE.md).

> Pre-1.0 phase only. The Technical Steering Committee (TSC) defined in
> [ROADMAP.md](./ROADMAP.md) supersedes this list at v1.0.

## Tiers

| Tier | Role | Bar to enter | Decisions they can make alone |
|---|---|---|---|
| **Core team (BDFN)** | Spec stewards. Final say on protocol direction during 0.x. | Listed in [GOVERNANCE.md](./GOVERNANCE.md) | Accept/reject EEIPs (pre-1.0 fast track); cut releases. |
| **Maintainers** | Own specific packages, schemas, or docs. | Sustained, high-quality contributions over ≥3 months and a sponsor from the core team. | Merge PRs in their area after one approval; triage issues. |
| **Reviewers** | Review PRs and triage issues. Cannot merge alone. | Demonstrated review quality on ≥5 merged PRs. | Approve PRs (review counts toward merge requirements). |
| **Emeritus** | Inactive past maintainers; recognised, no current rights. | Voluntary; or 6 months of inactivity. | None; can return via the maintainer process. |

Adding or removing someone from this file requires a PR approved by ≥2
core-team members.

---

## Core team (BDFN, pre-1.0)

The core team is named in [GOVERNANCE.md](./GOVERNANCE.md). Each member
discloses their primary affiliation and any potential conflict of interest
below; see [GOVERNANCE.md § Conflict of interest](./GOVERNANCE.md#conflict-of-interest)
for the disclosure standard.

| Name | Primary affiliation | Disclosed conflicts |
|---|---|---|---|
| Dr. Ugur Cekmez | more.md | Founder/maintainer of more.md, an EEP adopter. |
| Yigit Yakupoglu | Technic AI; Carnegie Mellon University (MS) | None disclosed. |
| Jackson Foley | ThriveLogic (ex-Lockheed Martin) | None disclosed. |
| Omid Jaafari | SudoVision | None disclosed. |
| Kasim Acikbas | Ultralytics | None disclosed. |
| Tarik Altuncu, PhD | Imperial College | None disclosed. |
| Erdem Cimenoglu | Siemens | None disclosed. |
| Berk Baytar | Chooch | None disclosed. |
| BeneluxSoft (org) | Development partner (Belgium) | Service partner for EEP adopters. |
| MUDT (org) | Research partner | Hosts EEP-related research. |

Each row's GitHub handle should be filled in via PR by the named member.
The "Disclosed conflicts" column is filled in by the member themselves and
updated when the situation changes.

---

## Package maintainers

Each row maps an artifact to the people who can merge changes to it.
Mirrored in [`.github/CODEOWNERS`](./.github/CODEOWNERS).

During the pre-1.0 BDFN phase, the **core team is the lead maintainer
for every path** in the table below. Per-package leads will be appointed
as sustained contributors emerge (see "How to become a maintainer"
below) and named individually in this table at that point.

| Path / artifact | Lead maintainers | Backups |
|---|---|---|
| `docs/current/SPECIFICATION.md` | Core team (≥2 approvals required) | — |
| `schemas/v0.1/**` | Core team (≥2 approvals required) | — |
| `docs/eeips/**` | Core team | — |
| `docs/standards/**` | Core team | — |
| `packages/@eep-dev/signer` | Core team | Cekmez |
| `packages/@eep-dev/validator` | Core team | Cekmez |
| `packages/@eep-dev/gates` | Core team | Yakupoglu |
| `packages/@eep-dev/discovery` | Core team | Cekmez |
| `packages/@eep-dev/middleware` | Core team | BeneluxSoft |
| `packages/@eep-dev/mcp-bridge` | Core team | Cekmez |
| `packages/@eep-dev/compliance-cli` | Core team | Yakupoglu |
| `packages/@eep-dev/setup-cli` | Core team | BeneluxSoft |
| `packages/@eep-dev/agent-adopt` | Core team | BeneluxSoft |
| `packages/eep-*-python/**` | Core team | Altuncu |
| `examples/**` | Any maintainer | — |
| `tests/conformance-fixtures/**` | Core team (≥2 approvals required) | — |
| `.github/workflows/**` | Core team | — |
| `NOTICE`, `LICENSE`, `GOVERNANCE.md`, `MAINTAINERS.md`, `CODEOWNERS` | Core team (≥2 approvals required) | — |

The "Backups" column lists a named member of the core team who has
context on the package and can review when the lead is unavailable. It
is *not* a separate trust tier — backups have the same merge rights as
any core-team member on that path.

---

## Reviewers (active)

The Reviewer tier is *open by default*: anyone whose PR review is
acknowledged on a merged PR (a `Reviewed-by:` trailer or a marked
"approved" review on GitHub) is informally a reviewer for the area
they reviewed. The list below names community contributors who have
been formally nominated via the process described under "How to become
a maintainer" — a step toward Maintainer tier.

_Open for nominations._ Until the first community-elected reviewers
are merged, the core team also acts as the reviewer pool for every
path.

---

## Emeritus

_None yet._

---

## How to become a maintainer

1. Open ≥5 substantive PRs in a single package or area, merged over at
   least 3 months.
2. Review ≥10 PRs from others, with at least one current maintainer
   noting the review quality as suitable for promotion.
3. A current maintainer in the area opens a PR adding you to the
   relevant row(s) of this file, with a short rationale.
4. The PR needs approval from ≥2 core-team members. If approved, the
   maintainer-tier change is merged and reflected in
   `.github/CODEOWNERS` in the same PR.

## How to step down

Open a PR moving yourself to **Emeritus**. No second approval is required
for a self-removal. Your CODEOWNERS entries are removed in the same PR.

---

## Contact

For governance questions or to nominate someone, open an issue with the
`governance` label, or email `hello@eep.dev` with `[Maintainers]` in the
subject.
