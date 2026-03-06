/**
 * Safety Switch - Production Readiness M0.
 * Global config flag: LIVE_TRADING must be explicitly enabled for real swap execution.
 * Default: false (paper mode).
 * M4: LIVE_TRADING=true requires RPC_MODE=real (policy gate).
 * Wave 8: Live-test mode config for Stage 3 limited capital.
 */
import { assertRealModeForLive } from "../core/config/rpc.js";

const LIVE_TRADING_ENV = "LIVE_TRADING";
const LIVE_TEST_MODE_ENV = "LIVE_TEST_MODE";
const MAX_CAPITAL_USD_ENV = "LIVE_TEST_MAX_CAPITAL_USD";
const MAX_TRADES_PER_DAY_ENV = "LIVE_TEST_MAX_TRADES_PER_DAY";
const MAX_DAILY_LOSS_USD_ENV = "LIVE_TEST_MAX_DAILY_LOSS_USD";

/**
 * Returns true only when LIVE_TRADING is explicitly set to "true" (case-insensitive).
 * Default: false — paper/dry-run mode.
 */
export function isLiveTradingEnabled(): boolean {
  const val = process.env[LIVE_TRADING_ENV];
  if (val == null || val === "") return false;
  return String(val).toLowerCase() === "true";
}

/**
 * M4 Policy: LIVE_TRADING=true requires RPC_MODE=real.
 * Throws if live trading enabled but RPC is stub.
 */
export function assertLiveTradingRequiresRealRpc(): void {
  if (!isLiveTradingEnabled()) return;
  assertRealModeForLive();
}

/**
 * Wave 8: Live-test mode config. Use for Stage 3 limited capital.
 */
export interface LiveTestConfig {
  enabled: boolean;
  maxCapitalUsd: number;
  maxTradesPerDay: number;
  maxDailyLossUsd: number;
}

const DEFAULT_LIVE_TEST: LiveTestConfig = {
  enabled: false,
  maxCapitalUsd: 100,
  maxTradesPerDay: 1,
  maxDailyLossUsd: 50,
};

/**
 * Returns live-test config from env. LIVE_TEST_MODE=true enables.
 */
export function getLiveTestConfig(): LiveTestConfig {
  const enabled =
    process.env[LIVE_TEST_MODE_ENV]?.toLowerCase() === "true" || false;
  const maxCapitalUsd = Math.max(
    0,
    parseInt(process.env[MAX_CAPITAL_USD_ENV] ?? String(DEFAULT_LIVE_TEST.maxCapitalUsd), 10) || DEFAULT_LIVE_TEST.maxCapitalUsd
  );
  const maxTradesPerDay = Math.max(
    1,
    parseInt(process.env[MAX_TRADES_PER_DAY_ENV] ?? String(DEFAULT_LIVE_TEST.maxTradesPerDay), 10) || DEFAULT_LIVE_TEST.maxTradesPerDay
  );
  const maxDailyLossUsd = Math.max(
    0,
    parseInt(process.env[MAX_DAILY_LOSS_USD_ENV] ?? String(DEFAULT_LIVE_TEST.maxDailyLossUsd), 10) || DEFAULT_LIVE_TEST.maxDailyLossUsd
  );
  return { enabled, maxCapitalUsd, maxTradesPerDay, maxDailyLossUsd };
}
