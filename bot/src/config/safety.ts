/**
 * Safety Switch - Production Readiness M0.
 * Global config flag: LIVE_TRADING must be explicitly enabled for real swap execution.
 * Default: false (paper mode).
 * M4: LIVE_TRADING=true requires RPC_MODE=real (policy gate).
 */
import { assertRealModeForLive } from "../core/config/rpc.js";

const LIVE_TRADING_ENV = "LIVE_TRADING";

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
