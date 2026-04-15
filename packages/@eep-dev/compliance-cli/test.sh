#!/bin/bash
set -euo pipefail
echo "  @eep-dev/compliance-cli — Test Suite"
npx vitest run --coverage
echo "  ALL TESTS PASSED"
