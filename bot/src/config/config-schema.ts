/**
 * Config schema - Zod validated environment and adapter config.
 * Normalized planning package: explicit execution mode, RPC mode, invalid combo validation.
 * Fail-closed on invalid/missing values.
 */
import { z } from "zod";

/** Execution mode: dry (no swap), paper (simulated), live (real swap) */
export const ExecutionModeSchema = z.enum(["dry", "paper", "live"]);
export type ExecutionMode = z.infer<typeof ExecutionModeSchema>;

/** RPC provider mode: stub (fake data), real (live chain) */
export const RpcModeSchema = z.enum(["stub", "real"]);
export type RpcMode = z.infer<typeof RpcModeSchema>;

export const ConfigSchema = z
  .object({
    // Environment
    nodeEnv: z
      .enum(["development", "test", "production"])
      .default("development"),

    // Feature flags
    dryRun: z.coerce.boolean().default(true),
    tradingEnabled: z.coerce.boolean().default(false),

    // Execution mode semantics (from LIVE_TRADING env)
    executionMode: z
      .enum(["dry", "paper", "live"])
      .default("dry"),

    // RPC provider mode (from RPC_MODE env)
    rpcMode: z
      .enum(["stub", "real"])
      .default("stub"),

    rpcUrl: z.string().url().optional().default("https://api.mainnet-beta.solana.com"),

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
  })
  .refine(
    (data) => {
      // Invalid combo: LIVE_TRADING (executionMode=live) requires RPC_MODE=real
      if (data.executionMode === "live" && data.rpcMode !== "real") {
        return false;
      }
      return true;
    },
    {
      message:
        "LIVE_TRADING=true (executionMode=live) requires RPC_MODE=real. Set RPC_MODE=real and RPC_URL for production.",
    }
  );

export type Config = z.infer<typeof ConfigSchema>;

function parseExecutionMode(env: Record<string, string | undefined>): ExecutionMode {
  const live = env.LIVE_TRADING?.toLowerCase() === "true";
  const dryRun = env.DRY_RUN?.toLowerCase() !== "false";
  if (live) return "live";
  if (dryRun) return "dry";
  return "paper";
}

function parseRpcMode(env: Record<string, string | undefined>): RpcMode {
  const m = env.RPC_MODE?.toLowerCase();
  return m === "real" ? "real" : "stub";
}

/**
 * Parse config from env. Throws on validation failure (fail-closed).
 * Invalid combo (LIVE_TRADING=true with RPC_MODE=stub) is rejected by refine.
 */
export function parseConfig(env: Record<string, string | undefined>): Config {
  const raw = {
    nodeEnv: env.NODE_ENV,
    dryRun: env.DRY_RUN,
    tradingEnabled: env.TRADING_ENABLED,
    executionMode: parseExecutionMode(env),
    rpcMode: parseRpcMode(env),
    rpcUrl: env.RPC_URL ?? "https://api.mainnet-beta.solana.com",
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
