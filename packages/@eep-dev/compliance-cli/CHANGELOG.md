# Changelog

All notable changes to @eep-dev/compliance-cli will be documented in this file.

## [Unreleased]

### Fixed
- **HMAC-SHA256 signature verification** — the previous inline comparison
  built a `Buffer` from the base64-encoded expected digest (~44 bytes) and
  fed it to `crypto.timingSafeEqual` against the base64-*decoded* incoming
  signature (32 bytes). `timingSafeEqual` throws on mismatched byte lengths;
  the throw was silently caught and reported as "could not compare
  signatures", so every conformance run mis-reported HMAC validity. The
  comparison now base64-decodes both sides into equal-length raw digest
  buffers, supports space-separated multi-signature headers (secret
  rotation per Standard Webhooks), ignores non-`v1` schemes, and reports a
  structured failure reason. Extracted as
  `verifyWebhookSignature` in `src/helpers.ts` with fixture-driven tests
  against `tests/conformance-fixtures/signature/`.
- **Test webhook receiver** — captures the raw request body bytes and
  feeds those to HMAC verification, replacing the previous
  `JSON.stringify(receivedWebhook)` which dropped sender-side whitespace
  and key ordering and could spuriously fail valid signatures.

### Added
- Initial release with core EEP conformance testing functionality
- Comprehensive test suite (standard, performance, security)
- Apache 2.0 licensing
- Full documentation
