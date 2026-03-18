/**
 * App bootstrap - config load, engine wire, server start.
 * Normalized planning package P1: single entry point.
 * Fail-closed: exits on config validation failure.
 */
import { loadConfig } from "./config/load-config.js";
import { createServer } from "./server/index.js";
import {
  createDryRunRuntime,
  type DryRunRuntimeDeps,
  type RuntimeSnapshot,
} from "./runtime/dry-run-runtime.js";
import { getKillSwitchState } from "./governance/kill-switch.js";
import { createAdaptersWithCircuitBreaker } from "./adapters/adapters-with-cb.js";
import { mapTokenToMarketSnapshot } from "./adapters/dexpaprika/mapper.js";
import { mapPairToMarketSnapshot } from "./adapters/dexscreener/mapper.js";
import { mapMoralisToWalletSnapshot } from "./adapters/moralis/mapper.js";
import type { Config } from "./config/config-schema.js";
import type { DexPaprikaTokenResponse } from "./adapters/dexpaprika/types.js";
import { CircuitBreaker } from "./governance/circuit-breaker.js";

const DEFAULT_PAPER_TOKEN_ID = "So11111111111111111111111111111111111111112";

/**
 * Bootstrap the application: validate config, start server.
 * Call assertLiveTradingRequiresRealRpc via loadConfig before any execution.
 */
export async function bootstrap(options?: {
  port?: number;
  host?: string;
  runtimeDeps?: DryRunRuntimeDeps;
}): Promise<{
  server: Awaited<ReturnType<typeof createServer>>;
  runtime: ReturnType<typeof createDryRunRuntime>;
}> {
  const config = loadConfig();
  const port = options?.port ?? parseInt(process.env.PORT ?? "3333", 10);
  const host = options?.host ?? process.env.HOST ?? "0.0.0.0";
  const runtime = createDryRunRuntime(config, createBootstrapRuntimeDeps(config, options?.runtimeDeps));

  console.info(
    "[bootstrap] Starting BobbyExecution runtime",
    JSON.stringify({
      executionMode: config.executionMode,
      rpcMode: config.rpcMode,
      tradingEnabled: config.tradingEnabled,
      safetyPosture: "fail-closed",
    })
  );

  await runtime.start();

  const getRuntimeSnapshot = (): RuntimeSnapshot => runtime.getSnapshot();

  const getBotStatus = (): "running" | "paused" | "stopped" => {
    if (getKillSwitchState().halted) return "paused";
    const runtimeStatus = runtime.getStatus();
    if (runtimeStatus === "running") return "running";
    if (runtimeStatus === "paused") return "paused";
    return "stopped";
  };

  let server: Awaited<ReturnType<typeof createServer>>;
  try {
    server = await createServer({
      port,
      host,
      getBotStatus,
      getRuntimeSnapshot,
      runtime,
    });
  } catch (error) {
    await runtime.stop();
    throw error;
  }

  return { server, runtime };
}

function createBootstrapRuntimeDeps(config: Config, runtimeDeps?: DryRunRuntimeDeps): DryRunRuntimeDeps | undefined {
  if (config.executionMode !== "paper") {
    return runtimeDeps;
  }

  if (!config.walletAddress) {
    throw new Error("Paper runtime requires WALLET_ADDRESS so wallet snapshot dependencies can be wired.");
  }

  const adapterBundle = createAdaptersWithCircuitBreaker({
    circuitBreakerConfig: {
      failureThreshold: config.circuitBreakerFailureThreshold,
      recoveryTimeMs: config.circuitBreakerRecoveryMs,
    },
    dexpaprika: { baseUrl: config.dexpaprikaBaseUrl, network: "solana" },
    moralis: { baseUrl: config.moralisBaseUrl, chain: "solana" },
  });
  const paperMarketAdapters =
    runtimeDeps?.paperMarketAdapters ??
    [
      {
        id: "dexpaprika",
        fetch: async () => {
          const timestamp = new Date().toISOString();
          const traceId = `bootstrap-paper-dexpaprika-${timestamp}`;
          const token = await adapterBundle.dexpaprika.getTokenWithHash(DEFAULT_PAPER_TOKEN_ID);
          const tokenRaw = token.raw as {
            id: string;
            name?: string;
            symbol: string;
            chain?: string;
            decimals?: number;
            summary?: { price_usd?: number; "24h"?: { volume?: number; volume_usd?: number }; liquidity_usd?: number };
          };

          return mapTokenToMarketSnapshot(
            {
              id: tokenRaw.id,
              name: tokenRaw.name ?? tokenRaw.symbol,
              symbol: tokenRaw.symbol,
              chain: tokenRaw.chain ?? "solana",
              decimals: tokenRaw.decimals ?? 9,
              summary: tokenRaw.summary,
            } satisfies DexPaprikaTokenResponse,
            traceId,
            timestamp,
            token.rawPayloadHash
          );
        },
      },
      {
        id: "dexscreener",
        fetch: async () => {
          const timestamp = new Date().toISOString();
          const traceId = `bootstrap-paper-dexscreener-${timestamp}`;
          const pairResult = await adapterBundle.dexscreener.getTokenPairsWithHash(DEFAULT_PAPER_TOKEN_ID);
          const pair = pairResult.raw.pairs?.[0];

          if (!pair) {
            throw new Error(`DexScreener returned no pairs for ${DEFAULT_PAPER_TOKEN_ID}`);
          }

          return mapPairToMarketSnapshot(pair, traceId, timestamp, pairResult.rawPayloadHash);
        },
      },
    ];
  const paperAdapterCircuitBreaker =
    runtimeDeps?.paperAdapterCircuitBreaker ??
    new CircuitBreaker(paperMarketAdapters.map((adapter) => adapter.id), {
      failureThreshold: config.circuitBreakerFailureThreshold,
      recoveryTimeMs: config.circuitBreakerRecoveryMs,
    });

  return {
    ...runtimeDeps,
    paperAdapterCircuitBreaker,
    paperMarketAdapters,
    fetchPaperWalletSnapshot:
      runtimeDeps?.fetchPaperWalletSnapshot ??
      (async () => {
        const timestamp = new Date().toISOString();
        const traceId = `bootstrap-paper-wallet-${timestamp}`;
        const wallet = await adapterBundle.moralis.getBalancesWithHash(config.walletAddress!);

        return mapMoralisToWalletSnapshot(
          wallet.raw as {
            result?: Array<{
              token_address: string;
              symbol: string;
              decimals: number;
              balance: string;
              usd_value?: number;
            }>;
          },
          config.walletAddress!,
          traceId,
          timestamp,
          wallet.rawPayloadHash
        );
      }),
  };
}
