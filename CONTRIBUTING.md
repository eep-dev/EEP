# Contributing to EEP (Entity Engagement Protocol)

Thank you for your interest in contributing to the EEP specification!

Please follow the **[Code of Conduct](./CODE_OF_CONDUCT.md)** in issues, discussions, and pull requests. For **security-sensitive** reports, use [SECURITY.md](./SECURITY.md) (never a public issue).

## Getting Started

1. **Fork** the repository
2. **Clone** your fork locally
3. **Create a branch** for your change (`git checkout -b feat/my-feature`)
4. **Make your changes** and commit (`git commit -m 'feat: add my feature'`)
5. **Push** to your fork (`git push origin feat/my-feature`)
6. **Open a Pull Request** against `main`

## Types of Contributions

### Specification Changes
- Propose changes via GitHub Issues first for discussion
- Reference relevant sections of the current specification
- Include rationale and backwards-compatibility considerations

### Schema Changes
- Ensure JSON Schema files validate correctly
- Include example payloads for new or modified schemas
- Maintain backwards compatibility with existing v0.1 schemas

### Package Contributions (@eep-dev/gates, @eep-dev/signer, @eep-dev/validator, @eep-dev/compliance-cli, @eep-dev/discovery)
- Follow TypeScript best practices
- Add tests for all new functionality
- Update the package README when changing public APIs

### Python Package Contributions
- Keep parity with corresponding TypeScript package behavior
- Add or update tests under each package `tests/` directory
- Document user-visible API changes in package README/CHANGELOG

### Examples
- Keep examples minimal and self-contained
- Include a README with setup instructions
- Test that examples work end-to-end

## Code Style

- Write clear commit messages using [Conventional Commits](https://www.conventionalcommits.org/)
- Add comments for non-obvious logic
- Update documentation when changing public APIs

## Pull Request Guidelines

- Keep PRs focused — one feature or fix per PR
- Include a clear description of what changed and why
- Add/update tests where applicable
- Ensure all existing tests pass

## Reporting Bugs

Use the [bug report form](https://github.com/eep-dev/EEP/issues/new?template=bug_report.yml) when possible. Otherwise open a [GitHub issue](https://github.com/eep-dev/EEP/issues) with:
- Steps to reproduce
- Expected vs actual behavior
- Environment details

## Releases (maintainers)

Tag-driven npm/PyPI publishing is documented in [RELEASING.md](./RELEASING.md).

## License

By contributing, you agree that your contributions will be licensed under the [Apache License 2.0](LICENSE).
