/**
 * Config loader - load and validate config on startup.
 * Fail-closed: throws on invalid config.
 * Calls assertLiveTradingRequiresRealRpc after parse (LIVE_TRADING=true requires RPC_MODE=real).
 */
import { parseConfig, type Config } from "./config-schema.js";
import { assertLiveTradingRequiresRealRpc } from "./safety.js";

let cachedConfig: Config | null = null;

/**
 * Load config from env. Validates on startup.
 * Throws on invalid config or invalid combo (LIVE_TRADING + stub RPC).
 */
export function loadConfig(env?: Record<string, string | undefined>): Config {
  if (cachedConfig) return cachedConfig;

  const source = (env ?? process.env) as Record<string, string | undefined>;
  cachedConfig = parseConfig(source);
  assertLiveTradingRequiresRealRpc();
  return cachedConfig;
}

/**
 * Reset cached config (for tests).
 */
export function resetConfigCache(): void {
  cachedConfig = null;
}
