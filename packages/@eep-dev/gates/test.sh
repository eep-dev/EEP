#!/bin/bash
set -euo pipefail
echo "  @eep-dev/gates — Test Suite"
npx vitest run --coverage
echo "  ALL TESTS PASSED"
