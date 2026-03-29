#!/usr/bin/env bash
# Wave 8 P1: Live-test pre-flight checklist.
# Run from repo root before enabling live test.
set -e
cd "$(dirname "$0")/.."

echo "=== Live Test Pre-Flight Checklist ==="
echo ""

echo "[1] Canonical live preflight..."
npm run live:preflight
echo "    OK"
echo ""

echo "=== Pre-flight PASSED ==="
echo ""
echo "Next: run 'npm run live:test' with LIVE_TEST_MODE=true, LIVE_TRADING=true, RPC_MODE=real"
echo "      plus distinct CONTROL_TOKEN and OPERATOR_READ_TOKEN values,"
echo "      along with MORALIS_API_KEY and JUPITER_API_KEY."
