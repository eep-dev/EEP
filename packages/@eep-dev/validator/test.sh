#!/bin/bash
set -euo pipefail
echo "  @eep-dev/validator — Test Suite"
npx vitest run --coverage
echo "  ALL TESTS PASSED"
