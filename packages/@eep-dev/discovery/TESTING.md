# Testing — @eep-dev/discovery

## Running Tests

```bash
npx vitest run        # Run once
npx vitest            # Watch mode
```

## Test Coverage

37 tests across three modules:

| Module | Tests | What's Covered |
|--------|-------|----------------|
| `validateManifest` | 22 | Required fields, DID format, version format, signing algorithms, tls_mode, pricing_mode, multi-error reporting |
| `parseLinkHeader` | 9 | Single/multiple links, rel filtering, type extraction, case insensitivity, null safety, malformed input |
| `parseDnsTxtRecord` | 8 | Valid records, version validation, HTTPS enforcement, missing fields, null safety |
