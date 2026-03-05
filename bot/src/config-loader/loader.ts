/**
 * Config loader - load and validate config from env.
 * Fail-closed on invalid configuration.
 */
import { parseConfig, type Config } from "./schema.js";

let cachedConfig: Config | null = null;

/**
 * Load config from process.env.
 * Caches result. Throws on validation failure (fail-closed).
 */
export function loadConfig(env?: Record<string, string | undefined>): Config {
  if (cachedConfig) return cachedConfig;

  const source = env ?? process.env;
  cachedConfig = parseConfig(source);
  return cachedConfig;
}

/**
 * Reset cached config (for tests).
 */
export function resetConfigCache(): void {
  cachedConfig = null;
}
