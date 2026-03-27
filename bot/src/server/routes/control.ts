/**
 * Runtime control routes.
 */
import type { FastifyPluginAsync } from "fastify";
import { getKillSwitchState } from "../../governance/kill-switch.js";
import type {
  RuntimeConfigControlView,
  RuntimeConfigDocument,
  RuntimeConfigStatus,
  RuntimeMode,
} from "../../config/runtime-config-schema.js";
import type {
  RuntimeConfigHistorySnapshot,
  RuntimeConfigMutationResult,
} from "../../runtime/runtime-config-manager.js";
import { buildRuntimeReadiness } from "../runtime-truth.js";
import { getMicroLiveControlSnapshot } from "../../runtime/live-control.js";
import { loadVisibleRuntimeState } from "../runtime-visibility.js";
import type {
  WorkerRestartService,
  WorkerRestartSnapshot,
  WorkerRestartStatus,
} from "../../control/worker-restart-service.js";
import type {
  WorkerRestartAlertActionResponse,
  WorkerRestartAlertListResponse,
  WorkerRestartAlertSummary,
} from "../../control/worker-restart-alert-service.js";
import type { WorkerRestartRequestRecord } from "../../persistence/worker-restart-repository.js";
import type { RuntimeVisibilityRepository } from "../../persistence/runtime-visibility-repository.js";
import type { RuntimeConfigManager } from "../../runtime/runtime-config-manager.js";
import type { RuntimeSnapshot } from "../../runtime/dry-run-runtime.js";
import type { RuntimeReadiness } from "../contracts/kpi.js";

export interface ControlRouteDeps {
  runtimeConfigManager?: RuntimeConfigManager;
  runtimeVisibilityRepository?: RuntimeVisibilityRepository;
  restartService?: WorkerRestartService;
  runtimeEnvironment?: string;
  requiredToken?: string;
  getRuntimeSnapshot?: () => RuntimeSnapshot;
}

export interface ControlResponse {
  success: boolean;
  message: string;
  code?: "control_auth_unconfigured" | "control_auth_invalid";
  runtimeStatus?: string;
  killSwitch: { halted: boolean; reason?: string; triggeredAt?: string };
  liveControl: import("../../runtime/live-control.js").MicroLiveControlSnapshot;
  readiness?: RuntimeReadiness;
}

export interface RuntimeConfigReadResponse {
  success: true;
  runtimeConfig: RuntimeConfigStatus;
  controlView: RuntimeConfigControlView;
  document: RuntimeConfigDocument;
}

export interface RuntimeConfigStatusResponse {
  success: true;
  runtime?: RuntimeSnapshot;
  worker?: import("../../persistence/runtime-visibility-repository.js").RuntimeWorkerVisibility;
  runtimeConfig?: RuntimeConfigStatus;
  controlView?: RuntimeConfigControlView;
  restart?: WorkerRestartStatus;
  restartAlerts?: WorkerRestartAlertSummary;
  readiness?: RuntimeReadiness;
  killSwitch: { halted: boolean; reason?: string; triggeredAt?: string };
  liveControl: import("../../runtime/live-control.js").MicroLiveControlSnapshot;
}

export interface RuntimeConfigHistoryResponse {
  success: true;
  history: RuntimeConfigHistorySnapshot;
}

export interface RestartAlertsResponse extends WorkerRestartAlertListResponse {
  success: true;
}

export interface RestartAlertMutationResponse extends WorkerRestartAlertActionResponse {
  success: boolean;
}

export interface RestartWorkerResponse {
  success: boolean;
  accepted: boolean;
  message: string;
  reason?: string;
  targetService: string;
  targetVersionId?: string;
  orchestrationMethod: "deploy_hook" | "render_api";
  restart: WorkerRestartStatus;
  runtimeConfig?: RuntimeConfigStatus;
  controlView?: RuntimeConfigControlView;
  worker?: import("../../persistence/runtime-visibility-repository.js").RuntimeWorkerVisibility;
  killSwitch: { halted: boolean; reason?: string; triggeredAt?: string };
  liveControl: import("../../runtime/live-control.js").MicroLiveControlSnapshot;
  restartAlerts?: WorkerRestartAlertSummary;
}

export interface RuntimeConfigMutationResponse extends RuntimeConfigMutationResult {
  success: boolean;
  status: RuntimeConfigStatus;
  runtimeConfig?: RuntimeConfigStatus;
  controlView?: RuntimeConfigControlView;
  restart?: WorkerRestartStatus;
  restartAlerts?: WorkerRestartAlertSummary;
  killSwitch: { halted: boolean; reason?: string; triggeredAt?: string };
  liveControl: import("../../runtime/live-control.js").MicroLiveControlSnapshot;
  readiness?: RuntimeReadiness;
}

function readPresentedToken(headers: Record<string, unknown>): string | undefined {
  const controlToken = headers["x-control-token"];
  if (typeof controlToken === "string" && controlToken.length > 0) {
    return controlToken;
  }

  const authorization = headers.authorization;
  if (typeof authorization === "string") {
    const match = authorization.match(/^Bearer\s+(.+)$/i);
    if (match) {
      return match[1];
    }
  }

  return undefined;
}

async function recordAuthFailure(
  runtimeConfigManager: RuntimeConfigManager | undefined,
  action: string,
  reason: string
): Promise<void> {
  if (!runtimeConfigManager) {
    return;
  }

  await runtimeConfigManager.recordAuthFailure({
    actor: "control_api",
    action,
    reason,
  });
}

function buildRuntimeConfigReadResponse(manager: RuntimeConfigManager): RuntimeConfigReadResponse {
  return {
    success: true,
    runtimeConfig: manager.getRuntimeConfigStatus(),
    controlView: manager.getRuntimeControlView(),
    document: manager.getRuntimeConfigDocument(),
  };
}

function buildMutationResponse(
  result: RuntimeConfigMutationResult,
  snapshot: WorkerRestartSnapshot,
  readiness?: RuntimeReadiness
): RuntimeConfigMutationResponse {
  return {
    ...result,
    success: result.accepted,
    status: snapshot.runtimeConfig,
    runtimeConfig: snapshot.runtimeConfig,
    controlView: snapshot.controlView,
    restart: snapshot.restart,
    restartAlerts: snapshot.restartAlerts,
    killSwitch: getKillSwitchState(),
    liveControl: getMicroLiveControlSnapshot(),
    readiness,
  };
}

function buildRuntimeConfigStatusResponse(
  snapshot: WorkerRestartSnapshot,
  readiness?: RuntimeReadiness
): RuntimeConfigStatusResponse {
  return {
    success: true,
    runtime: snapshot.runtime,
    worker: snapshot.worker,
    runtimeConfig: snapshot.runtimeConfig,
    controlView: snapshot.controlView,
    restart: snapshot.restart,
    restartAlerts: snapshot.restartAlerts,
    readiness,
    killSwitch: getKillSwitchState(),
    liveControl: getMicroLiveControlSnapshot(),
  };
}

function toReadiness(runtime?: RuntimeSnapshot): RuntimeReadiness | undefined {
  return buildRuntimeReadiness(runtime);
}

function buildFallbackRestartStatus(
  runtimeConfig: RuntimeConfigStatus,
  worker?: import("../../persistence/runtime-visibility-repository.js").RuntimeWorkerVisibility
): WorkerRestartStatus {
  return {
    required: runtimeConfig.requiresRestart,
    requested: false,
    inProgress: false,
    pendingVersionId: runtimeConfig.requiresRestart ? runtimeConfig.requestedVersionId : undefined,
    restartRequiredReason: runtimeConfig.pendingReason,
    lastHeartbeatAt: worker?.lastHeartbeatAt,
    lastAppliedVersionId: worker?.lastAppliedVersionId,
  };
}

function buildFallbackRestartAlerts(
  runtimeConfig: RuntimeConfigStatus,
  worker?: import("../../persistence/runtime-visibility-repository.js").RuntimeWorkerVisibility,
  request?: WorkerRestartRequestRecord | null
): WorkerRestartAlertSummary {
  return {
    environment: runtimeConfig.environment,
    workerService: request?.targetService ?? runtimeConfig.environment,
    latestRestartRequestStatus: request?.status,
    lastSuccessfulRestartConvergenceAt: request?.convergenceObservedAt,
    openAlertCount: 0,
    acknowledgedAlertCount: 0,
    resolvedAlertCount: 0,
    activeAlertCount: 0,
    stalledRestartCount: 0,
    highestOpenSeverity: undefined,
    divergenceAlerting: false,
    openSourceCategories: [],
    externalNotificationCount: 0,
    notificationFailureCount: 0,
    notificationSuppressedCount: 0,
    latestNotificationStatus: undefined,
    latestNotificationAt: undefined,
    latestNotificationFailureReason: undefined,
    latestNotificationSuppressionReason: undefined,
    lastEvaluatedAt: worker?.observedAt ?? new Date().toISOString(),
  };
}

async function readControlSnapshot(deps: ControlRouteDeps): Promise<WorkerRestartSnapshot> {
  if (deps.restartService) {
    try {
      return await deps.restartService.readSnapshot();
    } catch (error) {
      console.warn("[control] restart snapshot read failed; falling back to runtime state", error);
    }
  }

  if (!deps.runtimeConfigManager) {
    throw new Error("runtime config manager is required to build the control snapshot");
  }

  const visible = await loadVisibleRuntimeState(
    deps.runtimeVisibilityRepository,
    deps.runtimeEnvironment,
    deps.getRuntimeSnapshot
  );
  const runtimeConfig = deps.runtimeConfigManager.getRuntimeConfigStatus();
  return {
    runtime: visible.runtime,
    worker: visible.worker,
    runtimeConfig,
    controlView: deps.runtimeConfigManager.getRuntimeControlView(),
    restart: buildFallbackRestartStatus(runtimeConfig, visible.worker),
    restartAlerts: buildFallbackRestartAlerts(runtimeConfig, visible.worker),
    request: null,
  };
}

export function controlRoutes(deps: ControlRouteDeps = {}): FastifyPluginAsync {
  const { runtimeConfigManager, requiredToken } = deps;

  return async (fastify) => {
    fastify.addHook("preHandler", async (request, reply) => {
      const actionLabel = `${request.method} ${request.url}`;
      if (!requiredToken) {
        void recordAuthFailure(runtimeConfigManager, actionLabel, "control token not configured");
        return reply.status(403).send({
          success: false,
          code: "control_auth_unconfigured",
          message: "Control routes denied: CONTROL_TOKEN is not configured.",
          killSwitch: getKillSwitchState(),
          liveControl: getMicroLiveControlSnapshot(),
        } satisfies ControlResponse);
      }

      const presentedToken = readPresentedToken(request.headers as Record<string, unknown>);
      if (presentedToken !== requiredToken) {
        void recordAuthFailure(runtimeConfigManager, actionLabel, "missing or invalid control authorization");
        return reply.status(403).send({
          success: false,
          code: "control_auth_invalid",
          message: "Control routes denied: missing or invalid control authorization.",
          killSwitch: getKillSwitchState(),
          liveControl: getMicroLiveControlSnapshot(),
        } satisfies ControlResponse);
      }
    });

    fastify.post<{ Reply: ControlResponse | RuntimeConfigMutationResponse }>("/emergency-stop", async (_request, reply) => {
      if (!runtimeConfigManager) {
        return reply.status(503).send({
          success: false,
          message: "Emergency stop unavailable: runtime config manager is not wired.",
          killSwitch: getKillSwitchState(),
          liveControl: getMicroLiveControlSnapshot(),
        });
      }

      const result = await runtimeConfigManager.setKillSwitch({
        action: "trigger",
        actor: "control_api",
        reason: "API emergency-stop",
      });
      const snapshot = await readControlSnapshot(deps);
      const readiness = toReadiness(snapshot.runtime);
      return reply.status(result.accepted ? 200 : 409).send(buildMutationResponse(result, snapshot, readiness));
    });

    fastify.post<{
      Body: { scope?: "soft" | "hard"; reason?: string };
      Reply: ControlResponse | RuntimeConfigMutationResponse;
    }>("/control/pause", async (request, reply) => {
      if (!runtimeConfigManager) {
        return reply.status(503).send({
          success: false,
          message: "Pause unavailable: runtime config manager is not wired.",
          killSwitch: getKillSwitchState(),
          liveControl: getMicroLiveControlSnapshot(),
        });
      }

      const body = (request.body ?? {}) as { scope?: "soft" | "hard"; reason?: string };
      const scope = body.scope ?? "soft";
      const reason = body.reason ?? `${scope} pause`;
      const result = await runtimeConfigManager.setPause({
        scope,
        actor: "control_api",
        reason,
      });
      const snapshot = await readControlSnapshot(deps);
      return reply.status(result.accepted ? 200 : 409).send(buildMutationResponse(result, snapshot));
    });

    fastify.post<{
      Body: { reason?: string };
      Reply: ControlResponse | RuntimeConfigMutationResponse;
    }>("/control/resume", async (request, reply) => {
      if (!runtimeConfigManager) {
        return reply.status(503).send({
          success: false,
          message: "Resume unavailable: runtime config manager is not wired.",
          killSwitch: getKillSwitchState(),
          liveControl: getMicroLiveControlSnapshot(),
        });
      }

      const body = (request.body ?? {}) as { reason?: string };
      const result = await runtimeConfigManager.resume({
        actor: "control_api",
        reason: body.reason ?? "api_resume",
      });
      const snapshot = await readControlSnapshot(deps);
      return reply.status(result.accepted ? 200 : 409).send(buildMutationResponse(result, snapshot));
    });

    fastify.post<{ Reply: ControlResponse | RuntimeConfigMutationResponse }>("/control/halt", async (_request, reply) => {
      if (!runtimeConfigManager) {
        return reply.status(503).send({
          success: false,
          message: "Halt unavailable: runtime config manager is not wired.",
          killSwitch: getKillSwitchState(),
          liveControl: getMicroLiveControlSnapshot(),
        });
      }

      const result = await runtimeConfigManager.setKillSwitch({
        action: "trigger",
        actor: "control_api",
        reason: "API halt",
      });
      const snapshot = await readControlSnapshot(deps);
      return reply.status(result.accepted ? 200 : 409).send(buildMutationResponse(result, snapshot));
    });

    fastify.post<{ Reply: ControlResponse | RuntimeConfigMutationResponse }>("/control/reset", async (_request, reply) => {
      if (!runtimeConfigManager) {
        return reply.status(503).send({
          success: false,
          message: "Reset unavailable: runtime config manager is not wired.",
          killSwitch: getKillSwitchState(),
          liveControl: getMicroLiveControlSnapshot(),
        });
      }

      const result = await runtimeConfigManager.setKillSwitch({
        action: "reset",
        actor: "control_api",
        reason: "API reset",
      });
      const snapshot = await readControlSnapshot(deps);
      return reply.status(result.accepted ? 200 : 409).send(buildMutationResponse(result, snapshot));
    });

    fastify.get<{ Reply: RuntimeConfigReadResponse | ControlResponse }>("/control/runtime-config", async (_request, reply) => {
      if (!runtimeConfigManager) {
        return reply.status(503).send({
          success: false,
          message: "Runtime config unavailable: manager is not wired.",
          killSwitch: getKillSwitchState(),
          liveControl: getMicroLiveControlSnapshot(),
        });
      }

      return reply.status(200).send(buildRuntimeConfigReadResponse(runtimeConfigManager));
    });

    fastify.get<{ Reply: RuntimeConfigStatusResponse | ControlResponse }>("/control/status", async (_request, reply) => {
      if (!runtimeConfigManager) {
        return reply.status(503).send({
          success: false,
          message: "Runtime status unavailable: config manager is not wired.",
          killSwitch: getKillSwitchState(),
          liveControl: getMicroLiveControlSnapshot(),
        });
      }

      const snapshot = await readControlSnapshot(deps);
      return reply.status(200).send(buildRuntimeConfigStatusResponse(snapshot, toReadiness(snapshot.runtime)));
    });

    fastify.get<{ Reply: RuntimeConfigStatusResponse | ControlResponse }>("/control/runtime-status", async (_request, reply) => {
      if (!runtimeConfigManager) {
        return reply.status(503).send({
          success: false,
          message: "Runtime status unavailable: config manager is not wired.",
          killSwitch: getKillSwitchState(),
          liveControl: getMicroLiveControlSnapshot(),
        });
      }

      const snapshot = await readControlSnapshot(deps);
      return reply.status(200).send(buildRuntimeConfigStatusResponse(snapshot, toReadiness(snapshot.runtime)));
    });

    fastify.get<{ Querystring: { limit?: string }; Reply: RuntimeConfigHistoryResponse | ControlResponse }>(
      "/control/history",
      async (request, reply) => {
        if (!runtimeConfigManager) {
          return reply.status(503).send({
            success: false,
            message: "Runtime config history unavailable: manager is not wired.",
            killSwitch: getKillSwitchState(),
            liveControl: getMicroLiveControlSnapshot(),
          });
        }

        const limit = request.query.limit && /^\d+$/.test(request.query.limit) ? Number.parseInt(request.query.limit, 10) : 50;
        const history = await runtimeConfigManager.getHistory(Math.min(Math.max(limit, 1), 200));
        return reply.status(200).send({ success: true, history });
      }
    );

    fastify.post<{
      Body: { mode: RuntimeMode; reason?: string };
      Reply: RuntimeConfigMutationResponse | ControlResponse;
    }>("/control/mode", async (request, reply) => {
      if (!runtimeConfigManager) {
        return reply.status(503).send({
          success: false,
          message: "Runtime mode control unavailable: manager is not wired.",
          killSwitch: getKillSwitchState(),
          liveControl: getMicroLiveControlSnapshot(),
        });
      }

      const result = await runtimeConfigManager.setMode(request.body.mode, {
        actor: "control_api",
        reason: request.body.reason ?? `mode set to ${request.body.mode}`,
      });
      const snapshot = await readControlSnapshot(deps);
      return reply.status(result.accepted ? 200 : 409).send(buildMutationResponse(result, snapshot));
    });

    fastify.post<{
      Body: { patch: Record<string, unknown>; reason?: string };
      Reply: RuntimeConfigMutationResponse | ControlResponse;
    }>("/control/runtime-config", async (request, reply) => {
      if (!runtimeConfigManager) {
        return reply.status(503).send({
          success: false,
          message: "Runtime config mutation unavailable: manager is not wired.",
          killSwitch: getKillSwitchState(),
          liveControl: getMicroLiveControlSnapshot(),
        });
      }

      const result = await runtimeConfigManager.applyBehaviorPatch({
        patch: request.body.patch as never,
        actor: "control_api",
        reason: request.body.reason ?? "runtime config patch",
      });
      const snapshot = await readControlSnapshot(deps);
      return reply.status(result.accepted ? 200 : 409).send(buildMutationResponse(result, snapshot));
    });

    fastify.post<{
      Body: { reason?: string };
      Reply: RuntimeConfigMutationResponse | ControlResponse;
    }>("/control/reload", async (request, reply) => {
      if (!runtimeConfigManager) {
        return reply.status(503).send({
          success: false,
          message: "Reload unavailable: manager is not wired.",
          killSwitch: getKillSwitchState(),
          liveControl: getMicroLiveControlSnapshot(),
        });
      }

      const result = await runtimeConfigManager.reload({
        actor: "control_api",
        reason: request.body.reason ?? "control_api_reload",
      });
      const snapshot = await readControlSnapshot(deps);
      return reply.status(result.accepted ? 200 : 409).send(buildMutationResponse(result, snapshot));
    });

    fastify.post<{
      Body: { reason?: string };
      Reply: RestartWorkerResponse | ControlResponse;
    }>("/control/restart-worker", async (request, reply) => {
      if (!deps.restartService) {
        return reply.status(503).send({
          success: false,
          accepted: false,
          message: "Worker restart orchestration is unavailable.",
          killSwitch: getKillSwitchState(),
          liveControl: getMicroLiveControlSnapshot(),
        } as ControlResponse);
      }

      const body = (request.body ?? {}) as { reason?: string };
      const idempotencyKey = request.headers["x-idempotency-key"];
      const result = await deps.restartService.requestRestart({
        actor: "control_api",
        reason: body.reason,
        idempotencyKey: typeof idempotencyKey === "string" ? idempotencyKey : undefined,
      });
      return reply.status(result.statusCode).send({
        success: result.accepted,
        accepted: result.accepted,
        message: result.message,
        reason: result.reason,
        targetService: result.targetService,
        targetVersionId: result.targetVersionId,
        orchestrationMethod: result.orchestrationMethod,
        restart: result.restart,
        runtimeConfig: result.runtimeConfig,
        controlView: result.controlView,
        worker: result.worker,
        killSwitch: getKillSwitchState(),
        liveControl: getMicroLiveControlSnapshot(),
      });
    });

    fastify.get<{ Querystring: { limit?: string }; Reply: RestartAlertsResponse | ControlResponse }>(
      "/control/restart-alerts",
      async (request, reply) => {
        if (!deps.restartService) {
          return reply.status(503).send({
            success: false,
            message: "Restart alerts unavailable: restart service is not wired.",
            killSwitch: getKillSwitchState(),
            liveControl: getMicroLiveControlSnapshot(),
          });
        }

        const limit = request.query.limit && /^\d+$/.test(request.query.limit) ? Number.parseInt(request.query.limit, 10) : 50;
        const alerts = await deps.restartService.readRestartAlerts();
        return reply.status(200).send({
          success: true,
          summary: alerts.summary,
          alerts: alerts.alerts.slice(0, Math.min(Math.max(limit, 1), 200)),
        });
      }
    );

    fastify.post<{
      Params: { id: string };
      Body: { note?: string };
      Reply: RestartAlertMutationResponse | ControlResponse;
    }>("/control/restart-alerts/:id/acknowledge", async (request, reply) => {
      if (!deps.restartService) {
        return reply.status(503).send({
          success: false,
          message: "Restart alerts unavailable: restart service is not wired.",
          killSwitch: getKillSwitchState(),
          liveControl: getMicroLiveControlSnapshot(),
        });
      }

      const result = await deps.restartService.acknowledgeRestartAlert(request.params.id, {
        actor: "control_api",
        note: request.body?.note,
      });
      return reply.status(result.statusCode).send({
        success: result.accepted,
        accepted: result.accepted,
        statusCode: result.statusCode,
        message: result.message,
        reason: result.reason,
        alert: result.alert,
        summary: result.summary,
      });
    });

    fastify.post<{
      Params: { id: string };
      Body: { note?: string };
      Reply: RestartAlertMutationResponse | ControlResponse;
    }>("/control/restart-alerts/:id/resolve", async (request, reply) => {
      if (!deps.restartService) {
        return reply.status(503).send({
          success: false,
          message: "Restart alerts unavailable: restart service is not wired.",
          killSwitch: getKillSwitchState(),
          liveControl: getMicroLiveControlSnapshot(),
        });
      }

      const result = await deps.restartService.resolveRestartAlert(request.params.id, {
        actor: "control_api",
        note: request.body?.note,
      });
      return reply.status(result.statusCode).send({
        success: result.accepted,
        accepted: result.accepted,
        statusCode: result.statusCode,
        message: result.message,
        reason: result.reason,
        alert: result.alert,
        summary: result.summary,
      });
    });
  };
}
