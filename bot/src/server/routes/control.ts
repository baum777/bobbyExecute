/**
 * Wave 6 P0: POST /emergency-stop - halt all trading.
 */
import type { FastifyPluginAsync } from "fastify";
import { triggerKillSwitch, resetKillSwitch, getKillSwitchState } from "../../governance/kill-switch.js";

export interface EmergencyStopResponse {
  success: boolean;
  message: string;
  state: { halted: boolean; reason?: string; triggeredAt?: string };
}

export interface ResetResponse {
  success: boolean;
  message: string;
  state: { halted: boolean };
}

export const controlRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Reply: EmergencyStopResponse }>("/emergency-stop", async (_request, reply) => {
    triggerKillSwitch("API emergency-stop");
    const state = getKillSwitchState();
    return reply.status(200).send({
      success: true,
      message: "Emergency stop triggered. All trading halted. Manual reset required.",
      state: {
        halted: state.halted,
        reason: state.reason,
        triggeredAt: state.triggeredAt,
      },
    });
  });

  fastify.post<{ Reply: ResetResponse }>("/control/reset", async (_request, reply) => {
    resetKillSwitch();
    const state = getKillSwitchState();
    return reply.status(200).send({
      success: true,
      message: "Kill switch reset. Trading may resume.",
      state: { halted: state.halted },
    });
  });
};
