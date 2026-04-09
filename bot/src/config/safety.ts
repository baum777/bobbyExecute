/**
 * Safety Switch - Production Readiness M0.
 * Global config flag: LIVE_TRADING must be explicitly enabled for real swap execution.
 * Default: false (paper mode).
 * M4: LIVE_TRADING=true requires RPC_MODE=real (policy gate).
 * Wave 8: Live-test mode config for Stage 3 limited capital.
 */
import { assertRealModeForLive } from "../core/config/rpc.js";
import type { Config } from "./config-schema.js";

export type RolloutPosture = "paper_only" | "micro_live" | "staged_live_candidate" | "paused_or_rolled_back";

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
 * M4 Policy: LIVE_TRADING=true requires RPC_MODE=real and an explicit RPC_URL.
 * Throws if live trading enabled but RPC is stub or RPC_URL is missing.
 */
export function assertLiveTradingRequiresRealRpc(): void {
  if (!isLiveTradingEnabled()) return;
  assertRealModeForLive();
}

function readLiveTestIntegerEnv(
  envKey: string,
  fallback: number,
  min: number
): number {
  const raw = process.env[envKey];
  if (raw == null || raw === "") {
    return fallback;
  }

  const trimmed = raw.trim();
  if (!/^-?\d+$/.test(trimmed)) {
    throw new Error(`${envKey} must be an integer.`);
  }
  const parsed = Number.parseInt(trimmed, 10);
  if (parsed < min) {
    throw new Error(`${envKey} must be at least ${min}.`);
  }
  return parsed;
}

export function assertLiveTradingPrerequisites(config: Config): void {
  if (config.executionMode !== "live") {
    return;
  }

  if (config.dryRun) {
    throw new Error("LIVE_TRADING=true cannot be combined with DRY_RUN=true.");
  }

  assertLiveTradingRequiresRealRpc();

  if (!config.tradingEnabled) {
    throw new Error("LIVE_TRADING=true requires TRADING_ENABLED=true.");
  }

  if (!config.liveTestMode) {
    throw new Error("LIVE_TRADING=true requires LIVE_TEST_MODE=true.");
  }

  if (!config.walletAddress) {
    throw new Error("LIVE_TRADING=true requires WALLET_ADDRESS.");
  }

  if (config.signerMode !== "remote") {
    throw new Error("LIVE_TRADING=true requires SIGNER_MODE=remote.");
  }

  if (!config.signerUrl) {
    throw new Error("LIVE_TRADING=true requires SIGNER_URL when SIGNER_MODE=remote.");
  }

  if (!config.signerAuthToken) {
    throw new Error("LIVE_TRADING=true requires SIGNER_AUTH_TOKEN when SIGNER_MODE=remote.");
  }

  if (!config.controlToken) {
    throw new Error("LIVE_TRADING=true requires CONTROL_TOKEN.");
  }

  if (!config.operatorReadToken) {
    throw new Error("LIVE_TRADING=true requires OPERATOR_READ_TOKEN.");
  }

  if (config.discoveryProvider !== "dexscreener") {
    throw new Error("LIVE_TRADING=true requires DISCOVERY_PROVIDER=dexscreener.");
  }

  if (config.marketDataProvider !== "dexpaprika") {
    throw new Error("LIVE_TRADING=true requires MARKET_DATA_PROVIDER=dexpaprika.");
  }

  if (config.moralisEnabled && !config.moralisApiKey) {
    throw new Error("LIVE_TRADING=true requires MORALIS_API_KEY when MORALIS_ENABLED=true.");
  }

  if (!config.jupiterApiKey) {
    throw new Error("LIVE_TRADING=true requires JUPITER_API_KEY.");
  }

  if (config.operatorReadToken === config.controlToken) {
    throw new Error("LIVE_TRADING=true requires CONTROL_TOKEN and OPERATOR_READ_TOKEN to be distinct.");
  }
}

/**
 * Runtime policy authority is TS/env only.
 * YAML policy files are documentation/examples and cannot be authoritative at boot.
 */
export function assertRuntimePolicyAuthority(config: Config): void {
  if (config.runtimePolicyAuthority === "ts-env") {
    return;
  }

  throw new Error(
    "Runtime policy authority mismatch: YAML cannot be authoritative at runtime. Use TS/env only."
  );
}

export function parseRolloutPostureConfig(env: NodeJS.ProcessEnv = process.env): RolloutPosture | undefined {
  const raw = env.ROLLOUT_POSTURE?.trim();
  if (!raw) {
    return undefined;
  }

  const normalized = raw.toLowerCase();
  if (
    normalized === "paper_only" ||
    normalized === "micro_live" ||
    normalized === "staged_live_candidate" ||
    normalized === "paused_or_rolled_back"
  ) {
    return normalized;
  }

  throw new Error(
    `Startup readiness failed: Invalid rollout posture '${raw}'. Expected paper_only, micro_live, staged_live_candidate, or paused_or_rolled_back.`
  );
}

export function assertValidRolloutPostureConfig(env: NodeJS.ProcessEnv = process.env): void {
  parseRolloutPostureConfig(env);
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
  const maxCapitalUsd = readLiveTestIntegerEnv(
    MAX_CAPITAL_USD_ENV,
    DEFAULT_LIVE_TEST.maxCapitalUsd,
    1
  );
  const maxTradesPerDay = readLiveTestIntegerEnv(
    MAX_TRADES_PER_DAY_ENV,
    DEFAULT_LIVE_TEST.maxTradesPerDay,
    1
  );
  const maxDailyLossUsd = readLiveTestIntegerEnv(
    MAX_DAILY_LOSS_USD_ENV,
    DEFAULT_LIVE_TEST.maxDailyLossUsd,
    0
  );
  return { enabled, maxCapitalUsd, maxTradesPerDay, maxDailyLossUsd };
}

/**
 * Validates live-test prerequisites and returns the normalized live-test config.
 * In live mode, live-test mode must be enabled and caps must be sane.
 * In non-live modes, this is a no-op so paper/dry startup keeps working.
 */
export function assertLiveTestPrerequisites(config: Config): LiveTestConfig {
  const liveTestConfig = getLiveTestConfig();

  if (config.executionMode !== "live") {
    return liveTestConfig;
  }

  if (!liveTestConfig.enabled) {
    throw new Error("LIVE_TRADING=true requires LIVE_TEST_MODE=true.");
  }

  return liveTestConfig;
}
