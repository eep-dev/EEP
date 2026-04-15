#!/bin/bash
set -euo pipefail
echo "  @eep-dev/signer — Test Suite"
npx vitest run --coverage
echo "  ALL TESTS PASSED"
