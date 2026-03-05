/**
 * Config schema - Zod validated environment and adapter config.
 * Fail-closed on invalid/missing values.
 */
import { z } from "zod";

export const ConfigSchema = z.object({
  // Environment
  nodeEnv: z
    .enum(["development", "test", "production"])
    .default("development"),

  // Feature flags
  dryRun: z.coerce.boolean().default(true),
  tradingEnabled: z.coerce.boolean().default(false),

  // Adapter endpoints (optional in dev/test)
  dexpaprikaBaseUrl: z
    .string()
    .url()
    .optional()
    .default("https://api.dexpaprika.com"),
  moralisBaseUrl: z
    .string()
    .url()
    .optional()
    .default("https://solana-gateway.moralis.io"),

  // Wallet
  walletAddress: z.string().min(32).optional(),

  // Journal
  journalPath: z.string().optional().default("data/journal.jsonl"),

  // Circuit breaker
  circuitBreakerFailureThreshold: z.coerce.number().int().min(1).default(5),
  circuitBreakerRecoveryMs: z.coerce.number().int().min(1000).default(60000),

  // Guardrails
  maxSlippagePercent: z.coerce.number().min(0).max(100).default(5),
  reviewPolicyMode: z
    .enum(["none", "draft_only", "required"])
    .default("required"),
});

export type Config = z.infer<typeof ConfigSchema>;

export function parseConfig(env: Record<string, string | undefined>): Config {
  const raw = {
    nodeEnv: env.NODE_ENV,
    dryRun: env.DRY_RUN,
    tradingEnabled: env.TRADING_ENABLED,
    dexpaprikaBaseUrl: env.DEXPAPRIKA_BASE_URL,
    moralisBaseUrl: env.MORALIS_BASE_URL,
    walletAddress: env.WALLET_ADDRESS,
    journalPath: env.JOURNAL_PATH,
    circuitBreakerFailureThreshold: env.CIRCUIT_BREAKER_FAILURE_THRESHOLD,
    circuitBreakerRecoveryMs: env.CIRCUIT_BREAKER_RECOVERY_MS,
    maxSlippagePercent: env.MAX_SLIPPAGE_PERCENT,
    reviewPolicyMode: env.REVIEW_POLICY_MODE,
  };

  const result = ConfigSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(
      `Config validation failed (fail-closed): ${result.error.message}`
    );
  }
  return result.data;
}
