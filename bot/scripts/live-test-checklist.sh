#!/usr/bin/env bash
# Wave 8 P1: Live-test pre-flight checklist.
# Run from repo root before enabling live test.
set -e
cd "$(dirname "$0")/.."

echo "=== Live Test Pre-Flight Checklist ==="
echo ""

echo "[1] Lint..."
npm run lint
echo "    OK"
echo ""

echo "[2] Golden tasks..."
npm run test:golden
echo "    OK"
echo ""

echo "[3] Chaos suite..."
npm run test:chaos
echo "    OK"
echo ""

echo "[4] Integration tests..."
npm run test:integration
echo "    OK"
echo ""

echo "[5] E2E tests..."
npm run test:e2e
echo "    OK"
echo ""

echo "[6] Build..."
npm run build
echo "    OK"
echo ""

echo "=== Pre-flight PASSED ==="
echo ""
echo "Next: Set LIVE_TEST_MODE=true, LIVE_TRADING=true, RPC_MODE=real"
echo "      and run with limited capital (max 100 USD, 1 trade/day)."
