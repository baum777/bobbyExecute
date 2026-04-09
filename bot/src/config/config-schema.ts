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

/** Signer mode: disabled (no signing boundary), remote (server-to-server signer) */
export const SignerModeSchema = z.enum(["disabled", "remote"]);
export type SignerMode = z.infer<typeof SignerModeSchema>;

export const DiscoveryProviderSchema = z.enum(["dexscreener", "moralis"]);
export type DiscoveryProvider = z.infer<typeof DiscoveryProviderSchema>;

export const MarketDataProviderSchema = z.enum(["dexpaprika", "dexscreener", "moralis"]);
export type MarketDataProvider = z.infer<typeof MarketDataProviderSchema>;

export const StreamingProviderSchema = z.enum(["dexpaprika", "off"]);
export type StreamingProvider = z.infer<typeof StreamingProviderSchema>;

function parseBoolEnv(raw: string | undefined, fallback: boolean): boolean {
  if (raw == null || raw.trim() === "") {
    return fallback;
  }

  return raw.trim().toLowerCase() === "true";
}

export const ConfigSchema = z
  .object({
    // Environment
    nodeEnv: z
      .enum(["development", "test", "production"])
      .default("development"),

    // Feature flags
    dryRun: z.boolean().default(true),
    tradingEnabled: z.boolean().default(false),
    liveTestMode: z.boolean().default(false),
    runtimePolicyAuthority: z.enum(["ts-env", "yaml"]).default("ts-env"),

    // Execution mode semantics (from LIVE_TRADING env)
    executionMode: z
      .enum(["dry", "paper", "live"])
      .default("dry"),

    // RPC provider mode (from RPC_MODE env)
    rpcMode: z
      .enum(["stub", "real"])
      .default("stub"),

    rpcUrl: z.string().url().optional().default("https://api.mainnet-beta.solana.com"),

    // Signing boundary
    signerMode: z.enum(["disabled", "remote"]).default("disabled"),
    signerUrl: z.string().url().optional(),
    signerAuthToken: z.string().optional(),
    signerKeyId: z.string().min(1).optional(),
    signerTimeoutMs: z.coerce.number().int().min(100).default(10_000),

    // Adapter endpoints (optional in dev/test)
    discoveryProvider: z.enum(["dexscreener", "moralis"]).default("dexscreener"),
    marketDataProvider: z.enum(["dexpaprika", "dexscreener", "moralis"]).default("dexpaprika"),
    streamingProvider: z.enum(["dexpaprika", "off"]).default("dexpaprika"),
    moralisEnabled: z.boolean().default(false),
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
    moralisApiKey: z.string().optional(),
    jupiterApiKey: z.string().optional(),

    // Wallet
    walletAddress: z.string().min(32).optional(),
    controlToken: z.string().min(12).optional(),
    operatorReadToken: z.string().min(12).optional(),

    // Journal
    journalPath: z.string().optional().default("data/journal.jsonl"),
    dashboardOrigin: z.string().url().optional(),

    // Circuit breaker
    circuitBreakerFailureThreshold: z.coerce.number().int().min(1).default(5),
    circuitBreakerRecoveryMs: z.coerce.number().int().min(1000).default(60000),

    // Guardrails
    maxSlippagePercent: z.coerce.number().min(0).max(100).default(5),
    reviewPolicyMode: z
      .enum(["none", "draft_only", "required"])
      .default("required"),
  })
  .superRefine((data, ctx) => {
    if (data.executionMode !== "live") {
      return;
    }

    if (data.rpcMode !== "real") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "LIVE_TRADING=true (executionMode=live) requires RPC_MODE=real. Set RPC_MODE=real and RPC_URL for production.",
      });
    }

    if (!data.tradingEnabled) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "LIVE_TRADING=true (executionMode=live) requires TRADING_ENABLED=true.",
      });
    }

    if (!data.liveTestMode) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "LIVE_TRADING=true (executionMode=live) requires LIVE_TEST_MODE=true.",
      });
    }

    if (!data.walletAddress) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "LIVE_TRADING=true (executionMode=live) requires WALLET_ADDRESS.",
      });
    }

    if (data.discoveryProvider !== "dexscreener") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "LIVE_TRADING=true requires DISCOVERY_PROVIDER=dexscreener.",
      });
    }

    if (data.marketDataProvider !== "dexpaprika") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "LIVE_TRADING=true requires MARKET_DATA_PROVIDER=dexpaprika.",
      });
    }

    if (data.signerMode !== "remote") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "LIVE_TRADING=true (executionMode=live) requires SIGNER_MODE=remote.",
      });
    } else {
      if (!data.signerUrl) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "LIVE_TRADING=true (executionMode=live) requires SIGNER_URL when SIGNER_MODE=remote.",
        });
      }

      if (!data.signerAuthToken) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "LIVE_TRADING=true (executionMode=live) requires SIGNER_AUTH_TOKEN when SIGNER_MODE=remote.",
        });
      }
    }

    if (!data.controlToken) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "LIVE_TRADING=true (executionMode=live) requires CONTROL_TOKEN.",
      });
    }

    if (!data.operatorReadToken) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "LIVE_TRADING=true (executionMode=live) requires OPERATOR_READ_TOKEN.",
      });
    }

    if (data.moralisEnabled && !data.moralisApiKey) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "LIVE_TRADING=true requires MORALIS_API_KEY when MORALIS_ENABLED=true.",
      });
    }

    if (data.controlToken && data.operatorReadToken && data.controlToken === data.operatorReadToken) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "LIVE_TRADING=true requires CONTROL_TOKEN and OPERATOR_READ_TOKEN to be distinct.",
      });
    }
  });

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

function normalizeMoralisBaseUrl(raw: string | undefined): string | undefined {
  if (raw == null) {
    return undefined;
  }

  const trimmed = raw.trim();
  if (trimmed === "") {
    return undefined;
  }

  if (trimmed === "https://deep-index.moralis.io/api/v2.2") {
    return "https://solana-gateway.moralis.io";
  }

  return trimmed;
}

/**
 * Parse config from env. Throws on validation failure (fail-closed).
 * Invalid combo (LIVE_TRADING=true with RPC_MODE=stub) is rejected by refine.
 */
export function parseConfig(env: Record<string, string | undefined>): Config {
  const raw = {
    nodeEnv: env.NODE_ENV,
    dryRun: parseBoolEnv(env.DRY_RUN, true),
    tradingEnabled: parseBoolEnv(env.TRADING_ENABLED, false),
    liveTestMode: parseBoolEnv(env.LIVE_TEST_MODE, false),
    runtimePolicyAuthority: env.RUNTIME_POLICY_AUTHORITY,
    executionMode: parseExecutionMode(env),
    rpcMode: parseRpcMode(env),
    rpcUrl: env.RPC_URL ?? "https://api.mainnet-beta.solana.com",
    discoveryProvider: env.DISCOVERY_PROVIDER,
    marketDataProvider: env.MARKET_DATA_PROVIDER,
    streamingProvider: env.STREAMING_PROVIDER,
    moralisEnabled: parseBoolEnv(env.MORALIS_ENABLED, false),
    dexpaprikaBaseUrl: env.DEXPAPRIKA_BASE_URL,
    moralisBaseUrl: normalizeMoralisBaseUrl(env.MORALIS_BASE_URL),
    moralisApiKey: env.MORALIS_API_KEY,
    jupiterApiKey: env.JUPITER_API_KEY,
    walletAddress: env.WALLET_ADDRESS,
    signerMode: env.SIGNER_MODE,
    signerUrl: env.SIGNER_URL,
    signerAuthToken: env.SIGNER_AUTH_TOKEN,
    signerKeyId: env.SIGNER_KEY_ID,
    signerTimeoutMs: env.SIGNER_TIMEOUT_MS,
    controlToken: env.CONTROL_TOKEN,
    operatorReadToken: env.OPERATOR_READ_TOKEN,
    journalPath: env.JOURNAL_PATH,
    dashboardOrigin: env.DASHBOARD_ORIGIN,
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
