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
import type { RuntimeVisibilityRepository } from "../../persistence/runtime-visibility-repository.js";
import type { RuntimeConfigManager } from "../../runtime/runtime-config-manager.js";
import type { RuntimeSnapshot } from "../../runtime/dry-run-runtime.js";
import type { RuntimeReadiness } from "../contracts/kpi.js";

export interface ControlRouteDeps {
  runtimeConfigManager?: RuntimeConfigManager;
  runtimeVisibilityRepository?: RuntimeVisibilityRepository;
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
  readiness?: RuntimeReadiness;
  killSwitch: { halted: boolean; reason?: string; triggeredAt?: string };
  liveControl: import("../../runtime/live-control.js").MicroLiveControlSnapshot;
}

export interface RuntimeConfigHistoryResponse {
  success: true;
  history: RuntimeConfigHistorySnapshot;
}

export interface RuntimeConfigMutationResponse extends RuntimeConfigMutationResult {
  success: boolean;
  status: RuntimeConfigStatus;
  runtimeConfig?: RuntimeConfigStatus;
  controlView?: RuntimeConfigControlView;
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
  runtimeConfigManager: RuntimeConfigManager | undefined,
  readiness?: RuntimeReadiness
): RuntimeConfigMutationResponse {
  const status = runtimeConfigManager?.getRuntimeConfigStatus();
  return {
    ...result,
    success: result.accepted,
    status: status ?? result.status,
    runtimeConfig: status,
    controlView: runtimeConfigManager?.getRuntimeControlView(),
    killSwitch: getKillSwitchState(),
    liveControl: getMicroLiveControlSnapshot(),
    readiness,
  };
}

function buildRuntimeConfigStatusResponse(
  runtimeConfigManager: RuntimeConfigManager | undefined,
  runtime?: RuntimeSnapshot,
  worker?: import("../../persistence/runtime-visibility-repository.js").RuntimeWorkerVisibility,
  readiness?: RuntimeReadiness
): RuntimeConfigStatusResponse {
  const runtimeConfig = runtimeConfigManager?.getRuntimeConfigStatus();
  const controlView = runtimeConfigManager?.getRuntimeControlView();
  return {
    success: true,
    runtime,
    worker,
    runtimeConfig,
    controlView,
    readiness,
    killSwitch: getKillSwitchState(),
    liveControl: getMicroLiveControlSnapshot(),
  };
}

function toReadiness(runtime?: RuntimeSnapshot): RuntimeReadiness | undefined {
  return buildRuntimeReadiness(runtime);
}

export function controlRoutes(deps: ControlRouteDeps = {}): FastifyPluginAsync {
  const { runtimeConfigManager, runtimeVisibilityRepository, runtimeEnvironment, requiredToken, getRuntimeSnapshot } = deps;

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
      const readiness = toReadiness(getRuntimeSnapshot?.());
      return reply.status(result.accepted ? 200 : 409).send(buildMutationResponse(result, runtimeConfigManager, readiness));
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
      return reply.status(result.accepted ? 200 : 409).send(buildMutationResponse(result, runtimeConfigManager));
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
      return reply.status(result.accepted ? 200 : 409).send(buildMutationResponse(result, runtimeConfigManager));
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
      return reply.status(result.accepted ? 200 : 409).send(buildMutationResponse(result, runtimeConfigManager));
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
      return reply.status(result.accepted ? 200 : 409).send(buildMutationResponse(result, runtimeConfigManager));
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

      const visible = await loadVisibleRuntimeState(
        runtimeVisibilityRepository,
        runtimeEnvironment,
        getRuntimeSnapshot
      );
      return reply.status(200).send(
        buildRuntimeConfigStatusResponse(
          runtimeConfigManager,
          visible.runtime,
          visible.worker,
          toReadiness(visible.runtime)
        )
      );
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

      const visible = await loadVisibleRuntimeState(
        runtimeVisibilityRepository,
        runtimeEnvironment,
        getRuntimeSnapshot
      );
      return reply.status(200).send(
        buildRuntimeConfigStatusResponse(
          runtimeConfigManager,
          visible.runtime,
          visible.worker,
          toReadiness(visible.runtime)
        )
      );
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
      return reply.status(result.accepted ? 200 : 409).send(buildMutationResponse(result, runtimeConfigManager));
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
      return reply.status(result.accepted ? 200 : 409).send(buildMutationResponse(result, runtimeConfigManager));
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
      return reply.status(result.accepted ? 200 : 409).send(buildMutationResponse(result, runtimeConfigManager));
    });
  };
}
