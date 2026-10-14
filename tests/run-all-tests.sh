#!/usr/bin/env bash
# CrOS New Tab v0.3 — Shell Test Runner
# Usage: ./tests/run-all-tests.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_ROOT"

echo "Executing E2E test suite from: $PROJECT_ROOT"
python3 "$PROJECT_ROOT/tests/run_all_tests.py"
EXIT_CODE=$?

exit $EXIT_CODE
