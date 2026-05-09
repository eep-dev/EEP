# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in the EEP specification, the
reference implementations, or any published `@eep-dev/*` / `eep-*-python`
package, please report it responsibly.

**Do NOT open a public GitHub issue for security vulnerabilities.**

You have three reporting paths, listed in order of preference:

1. **GitHub private security advisory** (preferred). On
   [github.com/eep-dev/EEP](https://github.com/eep-dev/EEP), open
   **Security → Advisories → Report a vulnerability**. This preserves
   threading and coordinated-disclosure metadata.
2. **Email**: `hello@eep.dev` with the subject prefix **`[Security]`**.
   PGP-encrypted email is supported; the public key is published as
   noted under "Encrypted communication" below.
3. **Sigstore-attested issue** (for researchers who already operate
   keyless signing): see "Encrypted communication" below.

Please include in any report:

- A description of the vulnerability
- Reproduction steps and a minimal proof-of-concept
- Affected component(s) and version(s)
- Potential impact and any known exploitation
- Any suggested fixes (optional)

## Coordinated disclosure timeline

We commit to the following service levels for any incoming report. The
clock starts when the report lands at `hello@eep.dev` or in the GitHub
private advisory inbox:

| Phase | Target |
|---|---|
| Acknowledgement | within **48 hours** |
| Triage and severity assessment | within **5 business days** |
| Patch for critical (CVSS ≥ 9.0) issues | within **7 days** |
| Patch for high (CVSS 7.0–8.9) issues | within **14 days** |
| Patch for medium / low issues | within the next regular release |
| Public disclosure | **30 days** after a fix is available, unless the reporter requests a longer embargo |

If we cannot meet a target, we will say so in writing with a revised
timeline.

## Supported versions

| Version | Supported |
|---------|-----------|
| v0.1.x  | Yes       |
| v0.0.x  | No        |

The latest patch release in each minor line receives security fixes.
Pre-release tags (`-alpha.*`, `-beta.*`, `-rc.*`) are not supported in
production and should be treated as preview-only.

## Encrypted communication

For researchers who require encrypted-in-transit reporting, two options
are available:

- **PGP**: A project key is published at `https://eep.dev/.well-known/pgp.asc`
  and mirrored as a project release artifact. Fingerprint:
  *(to be published with the v0.1.1 release. Until then, use the GitHub
  private advisory path or request a key handoff via `hello@eep.dev`.)*
- **Sigstore identity**: The `release` GitHub Actions environment uses
  keyless signing under the
  `repo:eep-dev/EEP:environment:release` Sigstore identity. Researchers
  may submit a sigstore-signed report referencing this identity for
  high-assurance provenance.

## Security model and posture

EEP packages follow these defensive defaults; reports against any of
them are in scope:

- **HMAC-SHA256 webhook signing** with a 60-second replay window and
  constant-time comparison (`@eep-dev/signer`).
- **SSRF protection** with RFC 1918 / RFC 5735 CIDR blocks, DNS
  resolution against private IP space, and localhost alias blocking
  (`@eep-dev/validator`).
- **Replay/nonce protection** for gate proofs and payments via
  Redis-backed Lua scripts with hardcoded text (`@eep-dev/gates`).
- **No `eval`, no shell-string command injection, no automatic
  deserialization of untrusted JSON in headers** across the npm packages.
- **`npm audit --audit-level=high`** and **`pip-audit`** gate the
  release pipeline.
- **Provenance**: published npm packages carry SLSA build attestations
  (`npm publish --provenance`); published PyPI packages are uploaded via
  PyPI Trusted Publishing (OIDC); release artifacts are signed with
  sigstore/cosign keyless signatures.

The bridge between EEP and tool-call runtimes
(`@eep-dev/mcp-bridge`) has its own threat model documented at
[`packages/@eep-dev/mcp-bridge/SECURITY.md`](./packages/@eep-dev/mcp-bridge/SECURITY.md).

## External security review

A first **third-party security review** is on the
[ROADMAP.md](./ROADMAP.md) for v0.2 (Q3 2026). Candidate reviewers
include OSTIF, Trail of Bits, NCC Group, and Doyensec. The scope will
cover:

- HMAC signing and verification paths
- SSRF and webhook delivery
- Gate proof validation, replay, and revocation
- MCP-Bridge trust boundaries (prompt-injection from EEP events into
  MCP tool calls)
- Subprocess invocation in `@eep-dev/agent-adopt`

The redacted review report and its remediation log will be published
here when the engagement completes.

## Hall of fame and credit

We credit reporters (with their permission) in release notes and in this
file. To opt out of credit, say so in your report.

## Best practices for EEP implementors

- Never commit secrets, API keys, or HMAC signing keys to source
  control. Use a secrets manager and rotate via
  `@eep-dev/setup-cli rotate-secrets`.
- Validate every webhook signature using `@eep-dev/signer` (or the
  Python port). Reject any payload outside the 60-second replay window.
- Validate every subscriber-supplied `delivery_url` with
  `@eep-dev/validator` before opening an outbound connection.
- Use `@eep-dev/gates` for access control. Do not hand-roll the proof
  state machine.
- Keep your EEP packages and their transitive dependencies up to date;
  Dependabot / Renovate configurations in this repo are a good starting
  point to copy.
- Treat the EEP `Source-Verification` and `EEP-Version` headers as
  authoritative; do not mirror unverified subscriber claims back into
  your own audit log.
