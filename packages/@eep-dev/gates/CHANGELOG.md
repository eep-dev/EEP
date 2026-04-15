# Changelog — @eep-dev/gates

## 0.1.0 (2026-03-05)

### Added
- Gate configuration parsing, validation, and serialization
- Access resolution with tiered requirement matching
- Proof verification: structural, nonce replay (G29), double-spend detection (G32)
- Commerce state machine: offer → counter → accept → invoice → paid
- HTTP 402/429 response builders
- Service catalog and listing validation
- Proof-of-Intent (PoI) validation (G4)
- Request header validation (G24)
- Multi-chain payment validation (G27)
- Data request gate with W3C DPV support (G13)
- Agreement gate with SHA-256 license hashing (G14)
- Delegation proof VC support (G16)
- Operator policy profiles (G18)
- Auction/RFP pricing mode (G19)
- 446 tests with security test coverage
