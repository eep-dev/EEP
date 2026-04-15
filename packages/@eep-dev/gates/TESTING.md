# @eep-dev/gates Testing

Run all tests with coverage:

```bash
npm test
# or
./test.sh
```

## Test categories

| File | Focus | Count |
|------|-------|-------|
| `index.test.ts` | Gate config, resource matching, access resolution, 402 builder, proof validation | ~65 |
| `commerce.test.ts` | Negotiation state machine, pricing validation, envelope validation | ~22 |
| `service-listing.test.ts` | Service catalog, listing, and review validation | ~15 |
| `security.test.ts` | Tier escalation, proof replay, bypass attempts, injection | ~15 |
| `bench.test.ts` | Throughput for access checks and pattern matching | ~6 |
