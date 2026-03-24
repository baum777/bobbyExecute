import type { Config } from "../config/config-schema.js";
import { CircuitBreaker } from "../governance/circuit-breaker.js";
import {
  assertCanonicalPaperMarketAdapters,
  createCanonicalPaperMarketAdapters,
  createCanonicalPaperWalletSnapshotFetcher,
} from "../adapters/provider-roles.js";
import { createAdaptersWithCircuitBreaker } from "../adapters/adapters-with-cb.js";
import { FileSystemActionLogger } from "../observability/action-log.js";
import { createDryRunRuntime, type DryRunRuntime, type DryRunRuntimeDeps } from "./dry-run-runtime.js";

const DEFAULT_PAPER_TOKEN_ID = "So11111111111111111111111111111111111111112";

export type PaperRuntimeDeps = DryRunRuntimeDeps;

export function createPaperRuntime(config: Config, runtimeDeps?: PaperRuntimeDeps): DryRunRuntime {
  const actionLogger =
    runtimeDeps?.actionLogger ??
    new FileSystemActionLogger(config.journalPath.replace(/\.jsonl$/i, "") + ".actions.jsonl");

  if (config.executionMode !== "paper") {
    return createDryRunRuntime(config, {
      ...runtimeDeps,
      actionLogger,
    });
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

  return createDryRunRuntime(config, {
    ...runtimeDeps,
    actionLogger,
    paperAdapterCircuitBreaker,
    paperMarketAdapters,
    fetchPaperWalletSnapshot:
      runtimeDeps?.fetchPaperWalletSnapshot ??
      createCanonicalPaperWalletSnapshotFetcher({
        moralis: adapterBundle.moralis,
        walletAddress: config.walletAddress,
      }),
  });
}
