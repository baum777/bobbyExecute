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
import {
  assertCanonicalPaperMarketAdapters,
  createCanonicalPaperMarketAdapters,
  createCanonicalPaperWalletSnapshotFetcher,
} from "./adapters/provider-roles.js";
import type { Config } from "./config/config-schema.js";
import { CircuitBreaker } from "./governance/circuit-breaker.js";
import { FileSystemActionLogger } from "./observability/action-log.js";

const DEFAULT_PAPER_TOKEN_ID = "So11111111111111111111111111111111111111112";

/**
 * Bootstrap the application: validate config, start server.
 * Call live prerequisite checks via loadConfig before any execution.
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
  const runtimeDeps = createBootstrapRuntimeDeps(config, options?.runtimeDeps);
  const runtime = createDryRunRuntime(config, runtimeDeps);

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
      controlAuthToken: config.controlToken,
      operatorReadAuthToken: config.operatorReadToken,
      actionLogger: runtimeDeps.actionLogger,
    });
  } catch (error) {
    await runtime.stop();
    throw error;
  }

  return { server, runtime };
}

function createBootstrapRuntimeDeps(config: Config, runtimeDeps?: DryRunRuntimeDeps): DryRunRuntimeDeps {
  const actionLogger =
    runtimeDeps?.actionLogger ??
    new FileSystemActionLogger(config.journalPath.replace(/\.jsonl$/i, "") + ".actions.jsonl");
  if (config.executionMode !== "paper") {
    return {
      ...runtimeDeps,
      actionLogger,
    };
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
    createCanonicalPaperMarketAdapters({
      dexpaprika: adapterBundle.dexpaprika,
      tokenId: DEFAULT_PAPER_TOKEN_ID,
    });
  assertCanonicalPaperMarketAdapters(paperMarketAdapters);
  const paperAdapterCircuitBreaker =
    runtimeDeps?.paperAdapterCircuitBreaker ??
    new CircuitBreaker(paperMarketAdapters.map((adapter) => adapter.id), {
      failureThreshold: config.circuitBreakerFailureThreshold,
      recoveryTimeMs: config.circuitBreakerRecoveryMs,
    });

  return {
    ...runtimeDeps,
    actionLogger,
    paperAdapterCircuitBreaker,
    paperMarketAdapters,
    fetchPaperWalletSnapshot:
      runtimeDeps?.fetchPaperWalletSnapshot ??
      createCanonicalPaperWalletSnapshotFetcher({
        moralis: adapterBundle.moralis,
        walletAddress: config.walletAddress!,
      }),
  };
}
