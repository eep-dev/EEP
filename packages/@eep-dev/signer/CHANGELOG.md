# Changelog

All notable changes to @eep-dev/signer will be documented in this file.

## [Unreleased]

### Added
- Initial release with core HMAC-SHA256 signing and verification functionality
- Comprehensive test suite (standard, performance, security)
- Apache 2.0 licensing
- Full documentation

### Fixed
- `web.ts`: build break against `@types/node` >= 25, which narrows
  `SubtleCrypto.verify` to `BufferSource`. The base64-decoded signature
  is now cast accordingly.
