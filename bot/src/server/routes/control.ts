/**
 * Runtime control routes.
 */
import type { FastifyPluginAsync } from "fastify";
import { triggerKillSwitch, resetKillSwitch, getKillSwitchState } from "../../governance/kill-switch.js";
import type { DryRunRuntime, RuntimeControlResult } from "../../runtime/dry-run-runtime.js";
import { getMicroLiveControlSnapshot } from "../../runtime/live-control.js";
import { buildRuntimeReadiness } from "../runtime-truth.js";
import type { RuntimeReadiness } from "../contracts/kpi.js";

export interface ControlRouteDeps {
  runtime?: DryRunRuntime;
  requiredToken?: string;
}

export interface ControlResponse {
  success: boolean;
  message: string;
  code?: "control_auth_unconfigured" | "control_auth_invalid" | "runtime_control_unavailable";
  runtimeStatus?: string;
  killSwitch: { halted: boolean; reason?: string; triggeredAt?: string };
  liveControl: import("../../runtime/live-control.js").MicroLiveControlSnapshot;
  readiness?: RuntimeReadiness;
}

function toReply(
  result: RuntimeControlResult | null,
  killSwitch = getKillSwitchState(),
  readiness?: RuntimeReadiness
): ControlResponse {
  return {
    success: result?.success ?? true,
    message: result?.message ?? "Control action executed.",
    runtimeStatus: result?.status,
    killSwitch: {
      halted: killSwitch.halted,
      reason: killSwitch.reason,
      triggeredAt: killSwitch.triggeredAt,
    },
    liveControl: getMicroLiveControlSnapshot(),
    readiness,
  };
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

export function controlRoutes(deps: ControlRouteDeps = {}): FastifyPluginAsync {
  const { runtime, requiredToken } = deps;

  return async (fastify) => {
    fastify.addHook("preHandler", async (request, reply) => {
      if (!requiredToken) {
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
        return reply.status(403).send({
          success: false,
          code: "control_auth_invalid",
          message: "Control routes denied: missing or invalid control authorization.",
          killSwitch: getKillSwitchState(),
          liveControl: getMicroLiveControlSnapshot(),
        } satisfies ControlResponse);
      }
    });

    fastify.post<{ Reply: ControlResponse }>("/emergency-stop", async (_request, reply) => {
      triggerKillSwitch("API emergency-stop");
      const readiness = buildRuntimeReadiness(runtime?.getSnapshot());
      if (!runtime) {
        return reply.status(503).send({
          success: false,
          code: "runtime_control_unavailable",
          message: "Emergency stop triggered kill switch, but runtime control is unavailable so runtime state is unverifiable.",
          killSwitch: getKillSwitchState(),
          liveControl: getMicroLiveControlSnapshot(),
          readiness,
        });
      }
      const runtimeResult = await runtime.emergencyStop("kill_switch_emergency_stop");
      const status = runtimeResult.success ? 200 : 409;
      return reply.status(status).send(toReply(runtimeResult, getKillSwitchState(), readiness));
    });

    fastify.post<{ Reply: ControlResponse }>("/control/pause", async (_request, reply) => {
      const readiness = buildRuntimeReadiness(runtime?.getSnapshot());
      if (!runtime) {
        return reply.status(501).send({
          success: false,
          code: "runtime_control_unavailable",
          message: "Pause unsupported: runtime control unavailable.",
          killSwitch: getKillSwitchState(),
          liveControl: getMicroLiveControlSnapshot(),
          readiness,
        });
      }
      const result = await runtime.pause("api_pause");
      const status = result.success ? 200 : 409;
      return reply.status(status).send(toReply(result, getKillSwitchState(), readiness));
    });

    fastify.post<{ Reply: ControlResponse }>("/control/resume", async (_request, reply) => {
      const readiness = buildRuntimeReadiness(runtime?.getSnapshot());
      if (!runtime) {
        return reply.status(501).send({
          success: false,
          code: "runtime_control_unavailable",
          message: "Resume unsupported: runtime control unavailable.",
          killSwitch: getKillSwitchState(),
          liveControl: getMicroLiveControlSnapshot(),
          readiness,
        });
      }
      const result = await runtime.resume("api_resume");
      const status = result.success ? 200 : 409;
      return reply.status(status).send(toReply(result, getKillSwitchState(), readiness));
    });

    fastify.post<{ Reply: ControlResponse }>("/control/halt", async (_request, reply) => {
      const readiness = buildRuntimeReadiness(runtime?.getSnapshot());
      if (!runtime) {
        return reply.status(501).send({
          success: false,
          code: "runtime_control_unavailable",
          message: "Halt unsupported: runtime control unavailable.",
          killSwitch: getKillSwitchState(),
          liveControl: getMicroLiveControlSnapshot(),
          readiness,
        });
      }
      const result = await runtime.halt("api_halt");
      return reply.status(200).send(toReply(result, getKillSwitchState(), readiness));
    });

    fastify.post<{ Reply: ControlResponse }>("/control/reset", async (_request, reply) => {
      const readinessBeforeReset = buildRuntimeReadiness(runtime?.getSnapshot());
      if (runtime) {
        const runtimeResult = await runtime.resetLiveKill("api_reset");
        if (!runtimeResult.success) {
          return reply.status(409).send({
            success: false,
            message: runtimeResult.message,
            runtimeStatus: runtime.getStatus(),
            killSwitch: getKillSwitchState(),
            liveControl: getMicroLiveControlSnapshot(),
            readiness: readinessBeforeReset,
          });
        }
      }
      resetKillSwitch();
      return reply.status(200).send({
        success: true,
        message: "Kill switch reset. Live-test round returned to a safe preflighted state until explicit resume.",
        runtimeStatus: runtime?.getStatus(),
        killSwitch: getKillSwitchState(),
        liveControl: getMicroLiveControlSnapshot(),
        readiness: buildRuntimeReadiness(runtime?.getSnapshot()),
      });
    });

    fastify.post<{ Reply: ControlResponse }>("/control/live/arm", async (_request, reply) => {
      const readiness = buildRuntimeReadiness(runtime?.getSnapshot());
      if (!runtime) {
        return reply.status(501).send({
          success: false,
          code: "runtime_control_unavailable",
          message: "Live arm unsupported: runtime control unavailable.",
          killSwitch: getKillSwitchState(),
          liveControl: getMicroLiveControlSnapshot(),
          readiness,
        });
      }
      const result = await runtime.armLive("api_live_arm");
      const status = result.success ? 200 : 409;
      return reply.status(status).send(toReply(result, getKillSwitchState(), readiness));
    });

    fastify.post<{ Reply: ControlResponse }>("/control/live/disarm", async (_request, reply) => {
      const readiness = buildRuntimeReadiness(runtime?.getSnapshot());
      if (!runtime) {
        return reply.status(501).send({
          success: false,
          code: "runtime_control_unavailable",
          message: "Live disarm unsupported: runtime control unavailable.",
          killSwitch: getKillSwitchState(),
          liveControl: getMicroLiveControlSnapshot(),
          readiness,
        });
      }
      const result = await runtime.disarmLive("api_live_disarm");
      return reply.status(200).send(toReply(result, getKillSwitchState(), readiness));
    });
  };
}
