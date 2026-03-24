/**
 * Config loader - load and validate config on startup.
 * Fail-closed: throws on invalid config.
 * Calls assertLiveTradingPrerequisites after parse.
 */
import { parseConfig, type Config } from "./config-schema.js";
import {
  assertLiveTestPrerequisites,
  assertLiveTradingPrerequisites,
  assertValidRolloutPostureConfig,
  assertRuntimePolicyAuthority,
} from "./safety.js";

let cachedConfig: Config | null = null;

/**
 * Load config from env. Validates on startup.
 * Throws on invalid config or invalid live prerequisites.
 */
export function loadConfig(env?: Record<string, string | undefined>): Config {
  if (cachedConfig) return cachedConfig;

  const source = (env ?? process.env) as Record<string, string | undefined>;
  cachedConfig = parseConfig(source);
  assertRuntimePolicyAuthority(cachedConfig);
  assertValidRolloutPostureConfig(source);
  assertLiveTradingPrerequisites(cachedConfig);
  assertLiveTestPrerequisites(cachedConfig);
  return cachedConfig;
}

/**
 * Reset cached config (for tests).
 */
export function resetConfigCache(): void {
  cachedConfig = null;
}
