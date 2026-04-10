/**
 * Private control-plane entry point.
 * Runs the authenticated runtime mutation surface without starting the bot loop.
 */
import { loadConfig } from "../config/load-config.js";
import { createControlServer } from "../server/index.js";
import { RuntimeConfigManager } from "../runtime/runtime-config-manager.js";
import { createRuntimeVisibilityRepository } from "../persistence/runtime-visibility-repository.js";
import { createWorkerRestartRepository } from "../persistence/worker-restart-repository.js";
import { createWorkerRestartAlertRepository } from "../persistence/worker-restart-alert-repository.js";
import { SchemaMigrationError, formatSchemaStatus } from "../persistence/schema-migrations.js";
import { createWorkerRestartService } from "./worker-restart-service.js";
import { WorkerRestartAlertService } from "./worker-restart-alert-service.js";
import {
  WorkerRestartNotificationService,
  createStructuredWorkerRestartNotificationSink,
} from "./worker-restart-notification-service.js";
import { buildNotificationDestinationsFromEnv } from "./worker-restart-notification-routing.js";

const entryConfig = loadConfig();
if (!entryConfig.controlToken) {
  throw new Error("CONTROL_TOKEN is required for the private control service.");
}

const port = parseInt(process.env.PORT ?? "3334", 10);
const host = process.env.HOST ?? "0.0.0.0";
const runtimeEnvironment =
  process.env.RUNTIME_CONFIG_ENV?.trim() ?? process.env.RENDER_SERVICE_NAME?.trim() ?? entryConfig.nodeEnv;
const workerServiceName = process.env.WORKER_SERVICE_NAME?.trim() ?? "";
const restartConvergenceTimeoutMs = (() => {
  const parsed = Number.parseInt(process.env.CONTROL_RESTART_CONVERGENCE_TIMEOUT_MS ?? "600000", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 600000;
})();
const restartNotificationCooldownMs = (() => {
  const parsed = Number.parseInt(process.env.CONTROL_RESTART_ALERT_NOTIFICATION_COOLDOWN_MS ?? "300000", 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 300000;
})();
const restartAlertWebhookTimeoutMs = (() => {
  const parsed = Number.parseInt(process.env.CONTROL_RESTART_ALERT_WEBHOOK_TIMEOUT_MS ?? "5000", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 5000;
})();

console.log(
  "[control] Starting BobbyExecute control plane",
  JSON.stringify({
    nodeEnv: entryConfig.nodeEnv,
    controlPlaneEnvironment: runtimeEnvironment,
    safetyPosture: "fail-closed",
  })
);

(async () => {
  const runtimeConfigManager = await RuntimeConfigManager.create(entryConfig, {
    environment: runtimeEnvironment,
    databaseUrl: process.env.DATABASE_URL,
    redisUrl: process.env.REDIS_URL,
    env: process.env,
    bootstrapActor: "control-bootstrap",
  });
  await runtimeConfigManager.initialize();

  const runtimeVisibilityRepository = await createRuntimeVisibilityRepository(process.env.DATABASE_URL);
  await runtimeVisibilityRepository.ensureSchema();

  const restartRepository = await createWorkerRestartRepository(process.env.DATABASE_URL);
  await restartRepository.ensureSchema();

  const restartAlertRepository = await createWorkerRestartAlertRepository(process.env.DATABASE_URL);
  await restartAlertRepository.ensureSchema();

  const structuredNotificationSink = createStructuredWorkerRestartNotificationSink(console);
  const notificationDestinations = buildNotificationDestinationsFromEnv(process.env);
  const notificationService = new WorkerRestartNotificationService({
    environment: runtimeEnvironment,
    workerServiceName,
    alertRepository: restartAlertRepository,
    sinks: [structuredNotificationSink],
    destinations: notificationDestinations.destinations,
    notificationCooldownMs: restartNotificationCooldownMs,
    notificationTimeoutMs: restartAlertWebhookTimeoutMs,
    logger: console,
  });

  const restartAlertService = new WorkerRestartAlertService({
    environment: runtimeEnvironment,
    workerServiceName,
    restartRepository,
    alertRepository: restartAlertRepository,
    convergenceTimeoutMs: restartConvergenceTimeoutMs,
    notificationService,
    logger: console,
  });

  const restartService = createWorkerRestartService(entryConfig, {
    runtimeConfigManager,
    runtimeVisibilityRepository,
    restartRepository,
    alertService: restartAlertService,
    environment: runtimeEnvironment,
    workerServiceName,
    targetWorker: workerServiceName,
    deployHookUrl: process.env.WORKER_DEPLOY_HOOK_URL,
    env: process.env,
  });

  const server = await createControlServer({
    port,
    host,
    dashboardOrigin: process.env.DASHBOARD_ORIGIN,
    runtimeConfigManager,
    runtimeVisibilityRepository,
    runtimeEnvironment,
    controlAuthToken: entryConfig.controlToken,
    operatorReadToken: entryConfig.operatorReadToken,
    restartService,
    restartAlertRepository: restartAlertRepository,
    databaseUrl: process.env.DATABASE_URL,
  });

  const address = server.server.address();
  const bound =
    typeof address === "object" && address !== null && "address" in address
      ? `${String(address.address)}:${String(address.port)}`
      : `${host}:${port}`;
  console.log(`[control] Control plane listening on ${bound}`);
  console.log("Endpoints: GET /health, GET /kpi/summary, GET /control/status, GET /control/runtime-config, GET /control/history, GET /control/restart-alerts, GET /control/restart-alert-deliveries, GET /control/restart-alert-deliveries/summary, POST /control/restart-worker, POST /control/restart-alerts/:id/acknowledge, POST /control/restart-alerts/:id/resolve");

  const shutdown = async () => {
    await server.close();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
})().catch((error) => {
  if (error instanceof SchemaMigrationError) {
    console.error("[control] Schema readiness blocked startup:", formatSchemaStatus(error.status));
    console.error(JSON.stringify(error.status, null, 2));
    process.exit(1);
    return;
  }
  console.error("[control] Control plane failed:", error);
  process.exit(1);
});
