import { DEFAULT_REDUCEDMODE_CONFIG, type ReducedModeConfig } from "./defaults.js";

export function resolveConfig(overrides?: Partial<ReducedModeConfig>): ReducedModeConfig {
  const envOverrides: Partial<ReducedModeConfig> = {};

  const envMap: [string, keyof ReducedModeConfig, "number" | "boolean"][] = [
    ["REDUCEDMODE_MAX_UNIQUE_TOKENS", "MAX_UNIQUE_TOKENS", "number"],
    ["REDUCEDMODE_MIN_UNIQUE_TOKENS", "MIN_UNIQUE_TOKENS", "number"],
    ["REDUCEDMODE_DISCREPANCY_THRESHOLD", "DISCREPANCY_THRESHOLD", "number"],
    ["REDUCEDMODE_MIN_DATA_COMPLETENESS", "MIN_DATA_COMPLETENESS", "number"],
    ["REDUCEDMODE_MAX_RECOVERY_ATTEMPTS", "MAX_RECOVERY_ATTEMPTS", "number"],
    ["REDUCEDMODE_ENABLE_SOCIAL", "enableSocial", "boolean"],
    ["REDUCEDMODE_ENABLE_MORALIS", "enableMoralis", "boolean"],
    ["REDUCEDMODE_ENABLE_RPC_VERIFY", "enableRpcVerify", "boolean"],
  ];

  for (const [envKey, cfgKey, type] of envMap) {
    const val = process.env[envKey];
    if (val !== undefined) {
      if (type === "number") {
        const num = Number(val);
        if (Number.isFinite(num)) {
          (envOverrides as Record<string, unknown>)[cfgKey] = num;
        }
      } else if (type === "boolean") {
        (envOverrides as Record<string, unknown>)[cfgKey] = val === "true" || val === "1";
      }
    }
  }

  return { ...DEFAULT_REDUCEDMODE_CONFIG, ...envOverrides, ...overrides };
}
