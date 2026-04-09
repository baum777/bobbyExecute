import { writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const evidenceDir = scriptDir;
const sourceDir = resolve(scriptDir, "../live-limited-cycle-20260409T011755Z");
const journalPath = resolve(evidenceDir, "journal.jsonl");
const runtimeEnvironment = "controlled-live-limited";
const workerId = `controlled-${process.pid}`;
const controlToken = "controlled-control-token-12345";
const operatorReadToken = "controlled-read-token-67890";
const walletAddress = "11111111111111111111111111111111";
const defaultTokenId = "So11111111111111111111111111111111111111112";
const nowIso = () => new Date().toISOString();

Object.assign(process.env, {
  NODE_ENV: "development",
  LIVE_TRADING: "true",
  DRY_RUN: "false",
  TRADING_ENABLED: "true",
  LIVE_TEST_MODE: "true",
  LIVE_TEST_MAX_CAPITAL_USD: "10",
  LIVE_TEST_MAX_TRADES_PER_DAY: "1",
  LIVE_TEST_MAX_DAILY_LOSS_USD: "5",
  ROLLOUT_POSTURE: "micro_live",
  RUNTIME_POLICY_AUTHORITY: "ts-env",
  RPC_MODE: "real",
  RPC_URL: "https://api.mainnet-beta.solana.com",
  DISCOVERY_PROVIDER: "dexscreener",
  MARKET_DATA_PROVIDER: "dexpaprika",
  STREAMING_PROVIDER: "off",
  DEXPAPRIKA_BASE_URL: "https://api.dexpaprika.com",
  WALLET_ADDRESS: walletAddress,
  SIGNER_MODE: "remote",
  SIGNER_URL: "http://127.0.0.1:3999",
  SIGNER_AUTH_TOKEN: "controlled-signer-token",
  SIGNER_KEY_ID: "controlled-key",
  CONTROL_TOKEN: controlToken,
  OPERATOR_READ_TOKEN: operatorReadToken,
  JUPITER_API_KEY: "controlled-jupiter-key",
  JOURNAL_PATH: journalPath,
  RUNTIME_CONFIG_ENV: runtimeEnvironment,
  WORKER_SERVICE_NAME: workerId,
});

const {
  loadConfig,
} = await import("../../bot/dist/config/load-config.js");
const { RuntimeConfigManager } = await import("../../bot/dist/runtime/runtime-config-manager.js");
const { InMemoryRuntimeVisibilityRepository } = await import("../../bot/dist/persistence/runtime-visibility-repository.js");
const { createRuntime } = await import("../../bot/dist/runtime/create-runtime.js");
const { createControlServer } = await import("../../bot/dist/server/index.js");
const { createAdaptersWithCircuitBreaker } = await import("../../bot/dist/adapters/adapters-with-cb.js");
const { StubRpcClient } = await import("../../bot/dist/adapters/rpc-verify/client.js");
const { inspectWorkerDiskRecovery } = await import("../../bot/dist/recovery/worker-state-manifest.js");

await mkdir(evidenceDir, { recursive: true });

const config = loadConfig();
const bootCheck = inspectWorkerDiskRecovery({ journalPath: config.journalPath });
const runtimeConfigManager = new RuntimeConfigManager(config, {
  environment: runtimeEnvironment,
  env: process.env,
  bootstrapActor: "controlled-observation",
});
await runtimeConfigManager.initialize();
const runtimeVisibilityRepository = new InMemoryRuntimeVisibilityRepository();

const stubSigner = {
  mode: "remote",
  keyId: "controlled-key",
  async sign(request) {
    return {
      walletAddress: request.walletAddress,
      keyId: "controlled-key",
      signedTransactions: request.transactions.map((item) => ({
        id: item.id,
        kind: item.kind,
        encoding: item.encoding,
        signedPayload: item.payload,
      })),
    };
  },
};

const runtime = await createRuntime(config, {
  runtimeConfigManager,
  rpcClient: new StubRpcClient({ rpcUrl: config.rpcUrl }),
  signer: stubSigner,
  executionHandlerFactory: async () => async (intent) => ({
    traceId: intent.traceId,
    timestamp: intent.timestamp,
    tradeIntentId: intent.idempotencyKey,
    success: false,
    error: "controlled observation: execution stubbed",
    executionMode: intent.executionMode ?? (intent.dryRun ? "dry" : "paper"),
    dryRun: intent.dryRun,
    failClosed: true,
    failureStage: "controlled_observation",
    failureCode: "controlled_execution_stub",
    artifacts: { mode: "stub" },
  }),
  loopIntervalMs: 60_000,
});

const providerBundle = createAdaptersWithCircuitBreaker({
  dexpaprika: { baseUrl: config.dexpaprikaBaseUrl },
  dexscreener: { baseUrl: "https://api.dexscreener.com/latest" },
});

function serializeError(error) {
  return {
    name: error instanceof Error ? error.name : typeof error,
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  };
}

function buildVisibilitySnapshot(snapshot) {
  const observedAt = nowIso();
  return {
    producer: {
      name: "runtime-worker",
      kind: "runtime_visibility_snapshot",
      canonicalDecisionTruth: false,
    },
    environment: runtimeEnvironment,
    worker: {
      workerId,
      producer: {
        name: "runtime-worker",
        kind: "runtime_visibility_snapshot",
        canonicalDecisionTruth: false,
      },
      lastHeartbeatAt: observedAt,
      lastCycleAt: snapshot.lastCycleAt,
      lastSeenReloadNonce: snapshot.runtimeConfig?.reloadNonce,
      lastAppliedVersionId: snapshot.runtimeConfig?.appliedVersionId,
      lastValidVersionId: snapshot.runtimeConfig?.lastValidVersionId,
      degraded: Boolean(snapshot.status === "error" || snapshot.degradedState?.active || snapshot.adapterHealth?.degraded),
      degradedReason:
        snapshot.status === "error"
          ? snapshot.lastState?.error ?? snapshot.lastCycleSummary?.error ?? "worker error"
          : snapshot.degradedState?.lastReason ?? snapshot.lastCycleSummary?.blockedReason,
      errorState:
        snapshot.lastState?.error ??
        snapshot.lastCycleSummary?.error ??
        (snapshot.status === "error" ? "runtime error" : undefined),
      observedAt,
    },
    runtime: snapshot,
    metrics: {
      cycleCount: snapshot.counters.cycleCount,
      decisionCount: snapshot.counters.decisionCount,
      executionCount: snapshot.counters.executionCount,
      blockedCount: snapshot.counters.blockedCount,
      errorCount: snapshot.counters.errorCount,
      lastCycleAtEpochMs: snapshot.lastCycleAt ? Date.parse(snapshot.lastCycleAt) : 0,
      lastDecisionAtEpochMs: snapshot.lastDecisionAt ? Date.parse(snapshot.lastDecisionAt) : 0,
    },
  };
}

const result = {
  bootCheck,
  config: {
    executionMode: config.executionMode,
    rpcMode: config.rpcMode,
    liveTestMode: config.liveTestMode,
    rolloutPosture: process.env.ROLLOUT_POSTURE,
    journalPath: config.journalPath,
  },
  runtimeStart: null,
  runtimeSnapshotBeforeServer: null,
  providerProbes: {},
  http: {},
};

let runtimeStartSucceeded = false;
try {
  await runtime.start();
  runtimeStartSucceeded = true;
  result.runtimeStart = { success: true };
} catch (error) {
  result.runtimeStart = { success: false, error: serializeError(error) };
}

const runtimeSnapshot = runtime.getSnapshot();
result.runtimeSnapshotBeforeServer = runtimeSnapshot;
await runtimeVisibilityRepository.save(buildVisibilitySnapshot(runtimeSnapshot));

for (const probe of [
  {
    key: "dexscreener",
    run: () => providerBundle.dexscreener.getTokenPairsV1WithHash("solana", defaultTokenId),
  },
  {
    key: "dexpaprika",
    run: () => providerBundle.dexpaprika.getTokenWithHash(defaultTokenId),
  },
]) {
  try {
    const output = await probe.run();
    result.providerProbes[probe.key] = {
      success: true,
      payloadHash: output.rawPayloadHash,
    };
  } catch (error) {
    result.providerProbes[probe.key] = {
      success: false,
      error: serializeError(error),
    };
  }
}

const server = await createControlServer({
  port: 0,
  host: "127.0.0.1",
  runtimeConfigManager,
  runtimeVisibilityRepository,
  runtimeEnvironment,
  controlAuthToken: controlToken,
  operatorReadToken,
  getRuntimeSnapshot: () => runtime.getSnapshot(),
});

const address = server.server.address();
const port = typeof address === "object" && address && "port" in address ? address.port : undefined;
if (typeof port !== "number") {
  throw new Error("Unable to determine control server port.");
}
const baseUrl = `http://127.0.0.1:${port}`;

async function capture(path, headers = {}) {
  const response = await fetch(`${baseUrl}${path}`, { headers });
  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return {
    status: response.status,
    ok: response.ok,
    body,
  };
}

const readAuth = { Authorization: `Bearer ${operatorReadToken}` };
result.http.health = await capture("/health");
result.http.controlStatus = await capture("/control/status", readAuth);
result.http.releaseGate = await capture("/control/release-gate", readAuth);
result.http.kpiAdapters = await capture("/kpi/adapters");
result.http.kpiSummary = await capture("/kpi/summary");

if (runtimeStartSucceeded) {
  await runtime.stop().catch(() => undefined);
  result.runtimeStopped = true;
}

await server.close();

const evidence = {
  capturedAt: nowIso(),
  runtimeEnvironment,
  workerId,
  sourceDir,
  evidenceDir,
  bootCheck,
  result,
};

await writeFile(resolve(evidenceDir, "observation.json"), `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
await writeFile(resolve(evidenceDir, "manifest.json"), `${JSON.stringify({
  capturedAt: evidence.capturedAt,
  evidenceDir,
  journalPath,
  files: [
    "journal.jsonl",
    "journal.kill-switch.json",
    "journal.live-control.json",
    "journal.daily-loss.json",
    "journal.idempotency.json",
    "observation.json",
  ],
}, null, 2)}\n`, "utf8");

console.log(JSON.stringify({
  evidenceDir,
  runtimeStart: result.runtimeStart,
  providerProbes: result.providerProbes,
  healthStatus: result.http.health.status,
  controlStatusCode: result.http.controlStatus.status,
  releaseGateStatusCode: result.http.releaseGate.status,
}, null, 2));
