import type { FastifyReply, FastifyRequest } from "fastify";
import { getKillSwitchState } from "../../governance/kill-switch.js";
import { getMicroLiveControlSnapshot } from "../../runtime/live-control.js";
import type {
  ControlAction,
  ControlAuditEvent,
  ControlOperatorAuthContext,
} from "../../control/control-governance.js";
import {
  buildAuditEventId,
  buildControlAuditActor,
  classifyControlAction,
} from "../../control/control-governance.js";
import type { ControlRouteDeps } from "./control.js";

export function readPresentedToken(headers: Record<string, unknown>): string | undefined {
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

export function resolveRequestPath(url: string): string {
  try {
    return new URL(url, "http://control.local").pathname;
  } catch {
    return url.split("?")[0] ?? url;
  }
}

export function resolveRequestId(headers: Record<string, unknown>): string | undefined {
  const requestId = headers["x-request-id"];
  return typeof requestId === "string" && requestId.length > 0 ? requestId : undefined;
}

export function isReadOnlyControlRequest(method: string): boolean {
  return method === "GET" || method === "HEAD";
}

export function isControlMutation(method: string, targetPath: string): boolean {
  if (method === "GET" || method === "HEAD") {
    return false;
  }
  return Boolean(classifyControlAction(targetPath));
}

export async function recordAuthFailure(
  deps: ControlRouteDeps,
  action: string,
  target: string,
  reason: string,
  context?: ControlOperatorAuthContext,
  requestId?: string
): Promise<void> {
  if (deps.runtimeConfigManager) {
    await deps.runtimeConfigManager.recordAuthFailure({
      actor: context?.identity.actorId ?? "control_api",
      action,
      reason,
    });
  }

  if (deps.governanceRepository) {
    const actor = buildControlAuditActor(context?.identity ?? null);
    await deps.governanceRepository.recordAuditEvent({
      id: buildAuditEventId(),
      environment: deps.runtimeEnvironment ?? "development",
      action: "auth_failure",
      target,
      result: "denied",
      actorId: actor.actorId,
      actorDisplayName: actor.actorDisplayName,
      actorRole: actor.actorRole,
      sessionId: actor.sessionId,
      requestId,
      reason,
      note: action,
      createdAt: new Date().toISOString(),
      metadata: context
        ? {
            authResult: context.authResult,
            requestedAction: context.action,
            requestedTarget: context.target,
            deniedReason: context.reason,
          }
        : undefined,
    });
  }
}

export function getOperatorContext(request: FastifyRequest): ControlOperatorAuthContext {
  if (!request.controlOperatorContext) {
    throw new Error("operator context missing after authorization");
  }

  return request.controlOperatorContext;
}

const KILL_SWITCH_DISABLED_ACTIONS = new Set<ControlAction>([
  "pause",
  "resume",
  "mode_change",
  "runtime_config_change",
  "reload",
  "live_promotion_request",
  "live_promotion_approve",
  "live_promotion_deny",
  "live_promotion_apply",
  "live_promotion_rollback",
]);

export async function denyWhenKillSwitchActive(
  deps: ControlRouteDeps,
  context: ControlOperatorAuthContext,
  target: string,
  action: ControlAction,
  reply: FastifyReply
): Promise<boolean> {
  if (!KILL_SWITCH_DISABLED_ACTIONS.has(action)) {
    return false;
  }

  const killSwitch = getKillSwitchState();
  if (!killSwitch.halted) {
    return false;
  }

  const message = "Control route disabled while kill switch is active.";
  await recordOperatorAudit(deps, context, {
    action,
    target,
    result: "blocked",
    reason: killSwitch.reason ?? "kill switch active",
    note: message,
    requestId: context.requestId,
    metadata: {
      killSwitch,
    },
  });

  reply.status(409).send({
    success: false,
    message,
    killSwitch,
    liveControl: getMicroLiveControlSnapshot(),
  });
  return true;
}

export async function recordOperatorAudit(
  deps: ControlRouteDeps,
  context: ControlOperatorAuthContext | undefined,
  input: {
    action: ControlAuditEvent["action"];
    target: string;
    result: ControlAuditEvent["result"];
    reason?: string;
    note?: string;
    requestId?: string;
    metadata?: Record<string, unknown>;
  }
): Promise<void> {
  if (!deps.governanceRepository) {
    return;
  }

  const actor = buildControlAuditActor(context?.identity ?? null);
  await deps.governanceRepository.recordAuditEvent({
    id: buildAuditEventId(),
    environment: deps.runtimeEnvironment ?? "development",
    action: input.action,
    target: input.target,
    result: input.result,
    actorId: actor.actorId,
    actorDisplayName: actor.actorDisplayName,
    actorRole: actor.actorRole,
    sessionId: actor.sessionId,
    requestId: input.requestId,
    reason: input.reason,
    note: input.note,
    createdAt: new Date().toISOString(),
    metadata: input.metadata,
  });
}
