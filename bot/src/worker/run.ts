/**
 * Runtime worker entry point.
 */
import { loadConfig } from "../config/load-config.js";
import { createRuntimeVisibilityRepository } from "../persistence/runtime-visibility-repository.js";
import { startRuntimeWorker } from "./runtime-worker.js";

const entryConfig = loadConfig();
const runtimeEnvironment =
  process.env.RUNTIME_CONFIG_ENV?.trim() ?? process.env.RENDER_SERVICE_NAME?.trim() ?? entryConfig.nodeEnv;

console.log(
  "[worker] Starting BobbyExecute runtime worker",
  JSON.stringify({
    nodeEnv: entryConfig.nodeEnv,
    runtimeEnvironment,
    executionMode: entryConfig.executionMode,
    safetyPosture: "fail-closed",
  })
);

(async () => {
  const runtimeVisibilityRepository = await createRuntimeVisibilityRepository(process.env.DATABASE_URL);
  const parsedHeartbeatIntervalMs = Number.parseInt(process.env.WORKER_HEARTBEAT_INTERVAL_MS ?? "5000", 10);
  const worker = await startRuntimeWorker(entryConfig, {
    runtimeVisibilityRepository,
    runtimeEnvironment,
    heartbeatIntervalMs: Number.isFinite(parsedHeartbeatIntervalMs) ? parsedHeartbeatIntervalMs : 5000,
  });

  console.log(
    "[worker] Runtime worker started",
    JSON.stringify({
      workerId: worker.workerId,
      runtimeEnvironment,
    })
  );

  const shutdown = async () => {
    await worker.stop();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
})().catch((error) => {
  console.error("[worker] Runtime worker failed:", error);
  process.exit(1);
});
