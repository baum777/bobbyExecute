import type { Config } from "../config/config-schema.js";
import { createRuntime, type RuntimeDeps } from "../runtime/create-runtime.js";
import { RuntimeConfigManager } from "../runtime/runtime-config-manager.js";
import type { RuntimeSnapshot } from "../runtime/dry-run-runtime.js";
import type {
  RuntimeVisibilityRepository,
  RuntimeVisibilitySnapshot,
  RuntimeWorkerVisibility,
} from "../persistence/runtime-visibility-repository.js";
import { FileSystemJournalWriter } from "../journal-writer/writer.js";
import { startSidecarWorkerLoop } from "../runtime/sidecar/worker-loop.js";

export interface RuntimeWorkerProcess {
  workerId: string;
  runtime: Awaited<ReturnType<typeof createRuntime>>;
  runtimeConfigManager: RuntimeConfigManager;
  runtimeVisibilityRepository: RuntimeVisibilityRepository;
  stop(): Promise<void>;
  publishVisibilitySnapshot(): Promise<void>;
}

export interface RuntimeWorkerStartOptions {
  runtimeDeps?: RuntimeDeps;
  runtimeConfigManager?: RuntimeConfigManager;
  runtimeVisibilityRepository: RuntimeVisibilityRepository;
  runtimeEnvironment?: string;
  workerId?: string;
  heartbeatIntervalMs?: number;
  sidecarLoopDeps?: Partial<
    Omit<
      Parameters<typeof startSidecarWorkerLoop>[0],
      "runDiscoveryWorker" | "journalWriter"
    >
  >;
  sidecarDiscoveryWorker?: () => Promise<unknown>;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function resolveWorkerId(workerId?: string): string {
  return (
    workerId?.trim() ||
    process.env.RENDER_INSTANCE_ID?.trim() ||
    process.env.RENDER_SERVICE_NAME?.trim() ||
    `worker-${process.pid}`
  );
}

function buildWorkerVisibility(
  environment: string,
  workerId: string,
  snapshot: RuntimeSnapshot
): RuntimeVisibilitySnapshot {
  const runtimeConfig = snapshot.runtimeConfig;
  const worker: RuntimeWorkerVisibility = {
    workerId,
    lastHeartbeatAt: new Date().toISOString(),
    lastCycleAt: snapshot.lastCycleAt,
    lastSeenReloadNonce: runtimeConfig?.reloadNonce,
    lastAppliedVersionId: runtimeConfig?.appliedVersionId,
    lastValidVersionId: runtimeConfig?.lastValidVersionId,
    degraded: Boolean(snapshot.status === "error" || snapshot.degradedState?.active || snapshot.adapterHealth?.degraded),
    degradedReason:
      snapshot.status === "error"
        ? snapshot.lastState?.error ?? snapshot.lastCycleSummary?.error ?? "worker error"
        : snapshot.degradedState?.lastReason ?? snapshot.lastCycleSummary?.blockedReason,
    errorState:
      snapshot.lastState?.error ??
      snapshot.lastCycleSummary?.error ??
      (snapshot.status === "error" ? "runtime error" : undefined),
    observedAt: new Date().toISOString(),
  };

  return {
    environment,
    worker,
    runtime: clone(snapshot),
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

export async function startRuntimeWorker(
  config: Config,
  options: RuntimeWorkerStartOptions
): Promise<RuntimeWorkerProcess> {
  const workerId = resolveWorkerId(options.workerId);
  const runtimeEnvironment =
    options.runtimeEnvironment?.trim() ||
    process.env.RUNTIME_CONFIG_ENV?.trim() ||
    process.env.RENDER_SERVICE_NAME?.trim() ||
    config.nodeEnv;
  const runtimeConfigManager =
    options.runtimeConfigManager ??
    (await RuntimeConfigManager.create(config, {
      environment: runtimeEnvironment,
      databaseUrl: process.env.DATABASE_URL,
      redisUrl: process.env.REDIS_URL,
      env: process.env,
      bootstrapActor: "worker-bootstrap",
    }));
  const runtimeVisibilityRepository = options.runtimeVisibilityRepository;
  await runtimeConfigManager.initialize();
  await runtimeVisibilityRepository.ensureSchema();

  const runtime = await createRuntime(config, {
    ...(options.runtimeDeps ?? {}),
    runtimeConfigManager,
  });
  const sidecarJournalWriter = new FileSystemJournalWriter(
    config.journalPath.replace(/\.jsonl$/i, ".sidecar.jsonl"),
    { autoStartPeriodicFlush: false }
  );
  const sidecarLoop = startSidecarWorkerLoop({
    ...(options.sidecarLoopDeps ?? {}),
    journalWriter: sidecarJournalWriter,
    logger: options.sidecarLoopDeps?.logger ?? console,
    runDiscoveryWorker:
      options.sidecarDiscoveryWorker ??
      (async () => ({
        candidates: [],
      })),
  });

  let heartbeatTimer: NodeJS.Timeout | null = null;
  let stopped = false;

  const publishVisibilitySnapshot = async (): Promise<void> => {
    const snapshot = runtime.getSnapshot();
    await runtimeVisibilityRepository.save(buildWorkerVisibility(runtimeEnvironment, workerId, snapshot));
  };

  const stop = async (): Promise<void> => {
    if (stopped) {
      return;
    }
    stopped = true;
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
    sidecarLoop.stop();
    await runtime.stop();
    await publishVisibilitySnapshot().catch(() => {
      // Fail closed: the runtime has already been stopped, and the next boot will resync the worker snapshot.
    });
  };

  try {
    await runtime.start();
    if (runtimeConfigManager.getRuntimeConfigStatus().requiresRestart) {
      await runtimeConfigManager.confirmRestartApplied({
        actor: "worker-bootstrap",
        reason: "worker startup convergence",
      }).catch((error) => {
        // Fail closed: the worker keeps running, but the control plane will continue to show the restart as pending.
        console.warn("[worker] failed to acknowledge restart convergence", error);
      });
    }
    await publishVisibilitySnapshot();
    heartbeatTimer = setInterval(() => {
      void publishVisibilitySnapshot().catch(() => {
        // Fail closed: worker execution continues; the next heartbeat will retry.
      });
    }, options.heartbeatIntervalMs ?? 5_000);
  } catch (error) {
    await publishVisibilitySnapshot().catch(() => {
      // If startup failed, preserve the runtime's final snapshot only if possible.
    });
    throw error;
  }

  return {
    workerId,
    runtime,
    runtimeConfigManager,
    runtimeVisibilityRepository,
    publishVisibilitySnapshot,
    stop,
  };
}
