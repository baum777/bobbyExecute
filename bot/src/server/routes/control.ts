/**
 * Runtime control routes.
 */
import type { FastifyPluginAsync } from "fastify";
import { triggerKillSwitch, resetKillSwitch, getKillSwitchState } from "../../governance/kill-switch.js";
import type { DryRunRuntime, RuntimeControlResult } from "../../runtime/dry-run-runtime.js";

export interface ControlRouteDeps {
  runtime?: DryRunRuntime;
}

export interface ControlResponse {
  success: boolean;
  message: string;
  runtimeStatus?: string;
  killSwitch: { halted: boolean; reason?: string; triggeredAt?: string };
}

function toReply(result: RuntimeControlResult | null, killSwitch = getKillSwitchState()): ControlResponse {
  return {
    success: result?.success ?? true,
    message: result?.message ?? "Control action executed.",
    runtimeStatus: result?.status,
    killSwitch: {
      halted: killSwitch.halted,
      reason: killSwitch.reason,
      triggeredAt: killSwitch.triggeredAt,
    },
  };
}

export function controlRoutes(deps: ControlRouteDeps = {}): FastifyPluginAsync {
  const { runtime } = deps;

  return async (fastify) => {
    fastify.post<{ Reply: ControlResponse }>("/emergency-stop", async (_request, reply) => {
      triggerKillSwitch("API emergency-stop");
      if (!runtime) {
        return reply.status(503).send({
          success: false,
          message: "Emergency stop triggered kill switch, but runtime control is unavailable so runtime state is unverifiable.",
          killSwitch: getKillSwitchState(),
        });
      }
      const runtimeResult = await runtime.emergencyStop("kill_switch_emergency_stop");
      return reply.status(200).send(toReply(runtimeResult));
    });

    fastify.post<{ Reply: ControlResponse }>("/control/pause", async (_request, reply) => {
      if (!runtime) {
        return reply.status(501).send({
          success: false,
          message: "Pause unsupported: runtime control unavailable.",
          killSwitch: getKillSwitchState(),
        });
      }
      const result = await runtime.pause("api_pause");
      const status = result.success ? 200 : 409;
      return reply.status(status).send(toReply(result));
    });

    fastify.post<{ Reply: ControlResponse }>("/control/resume", async (_request, reply) => {
      if (!runtime) {
        return reply.status(501).send({
          success: false,
          message: "Resume unsupported: runtime control unavailable.",
          killSwitch: getKillSwitchState(),
        });
      }
      const result = await runtime.resume("api_resume");
      const status = result.success ? 200 : 409;
      return reply.status(status).send(toReply(result));
    });

    fastify.post<{ Reply: ControlResponse }>("/control/halt", async (_request, reply) => {
      if (!runtime) {
        return reply.status(501).send({
          success: false,
          message: "Halt unsupported: runtime control unavailable.",
          killSwitch: getKillSwitchState(),
        });
      }
      const result = await runtime.halt("api_halt");
      return reply.status(200).send(toReply(result));
    });

    fastify.post<{ Reply: ControlResponse }>("/control/reset", async (_request, reply) => {
      resetKillSwitch();
      return reply.status(200).send({
        success: true,
        message: "Kill switch reset. Runtime remains in current control state until explicit resume.",
        runtimeStatus: runtime?.getStatus(),
        killSwitch: getKillSwitchState(),
      });
    });
  };
}
