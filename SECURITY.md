# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in the EEP specification, reference implementations, or packages, please report it responsibly.

**Do NOT open a public GitHub issue for security vulnerabilities.**

If you use GitHub and have access, you may **open a private security advisory** on this repository (**Security → Advisories → Report a vulnerability**). That preserves threading and coordinated disclosure metadata. Otherwise, use email below.

Please email us at **hello@eep.dev** (use the subject prefix **`[Security]`** so we can route quickly) with:

- A description of the vulnerability
- Steps to reproduce
- Potential impact
- Any suggested fixes (optional)

We will acknowledge your report within **48 hours** and aim to provide a fix within **7 days** for critical issues.

## Supported Versions

| Version | Supported |
|---------|-----------|
| v0.1    | Yes       |

## Security Best Practices

- Never commit secrets, API keys, or credentials
- Use environment variables for all sensitive configuration
- Keep dependencies up to date
- Report any suspicious activity
- Validate all webhook signatures using @eep-dev/signer
- Use @eep-dev/validator for SSRF prevention
- Use @eep-dev/gates for access control and proof validation

## Acknowledgments

We appreciate responsible disclosure and will credit reporters (with permission) in our release notes.
