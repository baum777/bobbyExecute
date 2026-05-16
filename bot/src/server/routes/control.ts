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
import { getMicroLiveControlSnapshot } from "../../runtime/live-control.js";
import type { MicroLiveControlSnapshot } from "../../runtime/live-control.js";
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
import type {
  ControlGovernanceRepositoryWithAudits,
  ControlLivePromotionGate,
  ControlLivePromotionRecord,
  ControlOperatorAuthContext,
  ControlOperatorIdentity,
  ControlLivePromotionTargetMode,
  ControlRecoveryRehearsalOperationalStatus,
  ControlRecoveryRehearsalEvidenceRecord,
  ControlRecoveryRehearsalGate,
} from "../../control/control-governance.js";
import {
  CONTROL_OPERATOR_ASSERTION_HEADER,
  buildDatabaseRehearsalFreshnessStatus,
  canRolePerformControlAction,
  classifyControlAction,
  evaluateDatabaseRehearsalGate,
  evaluateLivePromotionGate,
  parseControlOperatorAssertion,
  requiredRoleForControlAction,
  syncDatabaseRehearsalFreshnessState,
} from "../../control/control-governance.js";
import type { WorkerRestartMethod } from "../../persistence/worker-restart-repository.js";
import type {
  WorkerRestartAlertRepository,
  WorkerRestartDeliveryJournalResult,
  WorkerRestartDeliverySummaryResult,
  WorkerRestartDeliveryTrendResult,
} from "../../persistence/worker-restart-alert-repository.js";
import type { RuntimeVisibilityRepository } from "../../persistence/runtime-visibility-repository.js";
import type { RuntimeConfigManager } from "../../runtime/runtime-config-manager.js";
import type { RuntimeSnapshot } from "../../runtime/dry-run-runtime.js";
import type { RuntimeReadiness } from "../contracts/kpi.js";
import {
  denyWhenKillSwitchActive,
  getOperatorContext,
  isControlMutation,
  isReadOnlyControlRequest,
  readPresentedToken,
  recordAuthFailure,
  recordOperatorAudit,
  resolveRequestId,
  resolveRequestPath,
} from "./control-auth.js";
import { buildDeliveryFilters, buildTrendFilters } from "./control-query.js";
import {
  buildFallbackRestartAlerts,
  buildFallbackRestartStatus,
  buildLivePromotionRecord,
  buildMutationResponse,
  buildOperatorReleaseGateResponse,
  buildRuntimeConfigReadResponse,
  buildRuntimeConfigStatusResponse,
  mergeLivePromotionRecord,
  toReadiness,
} from "./control-response-builders.js";

declare module "fastify" {
  interface FastifyRequest {
    controlOperatorContext?: ControlOperatorAuthContext;
  }
}

export interface ControlRouteDeps {
  runtimeConfigManager?: RuntimeConfigManager;
  runtimeVisibilityRepository?: RuntimeVisibilityRepository;
  restartService?: WorkerRestartService;
  restartAlertRepository?: WorkerRestartAlertRepository;
  governanceRepository?: ControlGovernanceRepositoryWithAudits;
  runtimeEnvironment?: string;
  requiredToken?: string;
  operatorReadToken?: string;
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
  databaseRehearsal?: ControlRecoveryRehearsalGate;
  databaseRehearsalStatus?: ControlRecoveryRehearsalOperationalStatus;
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

export interface RestartAlertDeliveriesResponse extends WorkerRestartDeliveryJournalResult {
  success: true;
}

export interface RestartAlertDeliveriesSummaryResponse extends WorkerRestartDeliverySummaryResult {
  success: true;
}

export interface RestartAlertDeliveryTrendsResponse extends WorkerRestartDeliveryTrendResult {
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
  orchestrationMethod: WorkerRestartMethod;
  restart: WorkerRestartStatus;
  runtimeConfig?: RuntimeConfigStatus;
  controlView?: RuntimeConfigControlView;
  worker?: import("../../persistence/runtime-visibility-repository.js").RuntimeWorkerVisibility;
  killSwitch: { halted: boolean; reason?: string; triggeredAt?: string };
  liveControl: import("../../runtime/live-control.js").MicroLiveControlSnapshot;
  restartAlerts?: WorkerRestartAlertSummary;
}

export interface LivePromotionGateResponse extends ControlLivePromotionGate {
  success: true;
}

export interface LivePromotionResponse {
  success: true;
  gate: ControlLivePromotionGate;
  currentMode: string;
  currentRuntimeStatus: string;
  requests: ControlLivePromotionRecord[];
}

export type OperatorReleaseStage = "paper_safe" | "micro_live" | "constrained_live" | "blocked";

export type OperatorChecklistStatus = "pass" | "fail" | "manual_review_required";

export interface OperatorEvidenceChecklistItem {
  id: string;
  label: string;
  required: boolean;
  surfaceKind: "command" | "route" | "file";
  surfaceRef: string;
  note?: string;
}

export interface OperatorIncidentProcedure {
  id: "provider_outage" | "signer_failure" | "kill_switch" | "degraded_mode" | "rollback";
  trigger: string;
  operatorAction: string;
  controlSurfaces: string[];
  evidenceSurfaces: string[];
}

export interface OperatorReleaseGateChecklistItem {
  id: string;
  label: string;
  status: OperatorChecklistStatus;
  evidence: string[];
  note?: string;
}

export interface OperatorReleaseGateResponse {
  success: true;
  surfaceKind: "operational" | "derived" | "unwired";
  rolloutStage: OperatorReleaseStage;
  readiness?: RuntimeReadiness;
  releaseGate: {
    recommendedStage: OperatorReleaseStage;
    canArmMicroLive: boolean;
    canUseStagedLiveCandidate: boolean;
    blockers: RuntimeReadiness["blockers"];
    checklist: OperatorReleaseGateChecklistItem[];
  };
  operatorEvidenceChecklist: OperatorEvidenceChecklistItem[];
  incidentRunbook: OperatorIncidentProcedure[];
  killSwitch: { halted: boolean; reason?: string; triggeredAt?: string };
  liveControl: MicroLiveControlSnapshot;
}

export interface LivePromotionRequestResponse {
  success: boolean;
  accepted: boolean;
  message: string;
  request?: ControlLivePromotionRecord;
  gate?: ControlLivePromotionGate;
  reason?: string;
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

async function loadLatestDatabaseRehearsalEvidenceForSnapshot(
  deps: ControlRouteDeps,
  snapshot: WorkerRestartSnapshot
): Promise<ControlRecoveryRehearsalEvidenceRecord | null> {
  const environment = snapshot.runtimeConfig.environment ?? deps.runtimeEnvironment ?? "development";
  return deps.governanceRepository ? await deps.governanceRepository.loadLatestDatabaseRehearsalEvidence(environment) : null;
}

async function buildDatabaseRehearsalGateForSnapshot(
  deps: ControlRouteDeps,
  snapshot: WorkerRestartSnapshot
): Promise<ControlRecoveryRehearsalGate | undefined> {
  if (!deps.governanceRepository) {
    return undefined;
  }

  let latestDatabaseRehearsal: ControlRecoveryRehearsalEvidenceRecord | null = null;
  try {
    latestDatabaseRehearsal = await loadLatestDatabaseRehearsalEvidenceForSnapshot(deps, snapshot);
  } catch (error) {
    console.warn("[control] database rehearsal gate lookup failed; failing closed", error);
  }
  return evaluateDatabaseRehearsalGate(latestDatabaseRehearsal, {
    targetMode: "live",
  });
}

async function buildDatabaseRehearsalStatusForSnapshot(
  deps: ControlRouteDeps,
  snapshot: WorkerRestartSnapshot
): Promise<ControlRecoveryRehearsalOperationalStatus | undefined> {
  if (!deps.governanceRepository) {
    return undefined;
  }

  const environment = snapshot.runtimeConfig.environment ?? deps.runtimeEnvironment ?? "development";
  try {
    return await syncDatabaseRehearsalFreshnessState(deps.governanceRepository, environment, {
      nowMs: Date.now(),
    });
  } catch (error) {
    console.warn("[control] database rehearsal freshness sync failed; returning degraded freshness status", error);
    return buildDatabaseRehearsalFreshnessStatus([], {
      environment,
      nowMs: Date.now(),
    });
  }
}

async function evaluateLivePromotionGateWithRehearsalEvidence(
  deps: ControlRouteDeps,
  snapshot: WorkerRestartSnapshot,
  targetMode: ControlLivePromotionTargetMode
): Promise<ControlLivePromotionGate> {
  let latestDatabaseRehearsal: ControlRecoveryRehearsalEvidenceRecord | null = null;
  try {
    latestDatabaseRehearsal = await loadLatestDatabaseRehearsalEvidenceForSnapshot(deps, snapshot);
  } catch (error) {
    console.warn("[control] live promotion rehearsal lookup failed; failing closed", error);
  }

  return evaluateLivePromotionGate(snapshot, toReadiness(snapshot.runtime), targetMode, {
    latestDatabaseRehearsal,
  });
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
  const { runtimeConfigManager, requiredToken, governanceRepository } = deps;

  return async (fastify) => {
    fastify.addHook("preHandler", async (request, reply) => {
      const actionLabel = `${request.method} ${request.url}`;
      if (!requiredToken) {
        void recordAuthFailure(deps, actionLabel, resolveRequestPath(request.url), "control token not configured", undefined, resolveRequestId(request.headers as Record<string, unknown>));
        return reply.status(403).send({
          success: false,
          code: "control_auth_unconfigured",
          message: "Control routes denied: CONTROL_TOKEN is not configured.",
          killSwitch: getKillSwitchState(),
          liveControl: getMicroLiveControlSnapshot(),
        } satisfies ControlResponse);
      }

      const presentedToken = readPresentedToken(request.headers as Record<string, unknown>);
      const isReadRequest = isReadOnlyControlRequest(request.method);
      const readTokenAccepted = isReadRequest && deps.operatorReadToken && presentedToken === deps.operatorReadToken;
      if (presentedToken !== requiredToken && !readTokenAccepted) {
        const denialReason = isReadRequest
          ? "missing or invalid operator read authorization"
          : "missing or invalid control authorization";
        void recordAuthFailure(
          deps,
          actionLabel,
          resolveRequestPath(request.url),
          denialReason,
          undefined,
          resolveRequestId(request.headers as Record<string, unknown>)
        );
        return reply.status(403).send({
          success: false,
          code: "control_auth_invalid",
          message: `Control routes denied: ${denialReason}.`,
          killSwitch: getKillSwitchState(),
          liveControl: getMicroLiveControlSnapshot(),
        } satisfies ControlResponse);
      }

      const targetPath = resolveRequestPath(request.url);
      const routeAction = classifyControlAction(targetPath);
      if (!routeAction || !isControlMutation(request.method, targetPath)) {
        return;
      }

      const requestId = resolveRequestId(request.headers as Record<string, unknown>);
      const assertion = parseControlOperatorAssertion(
        typeof request.headers[CONTROL_OPERATOR_ASSERTION_HEADER] === "string"
          ? (request.headers[CONTROL_OPERATOR_ASSERTION_HEADER] as string)
          : undefined,
        requiredToken
      );
      if (!assertion) {
        void recordAuthFailure(
          deps,
          actionLabel,
          targetPath,
          "missing or invalid operator assertion",
          undefined,
          requestId
        );
        return reply.status(403).send({
          success: false,
          code: "control_auth_invalid",
          message: "Control routes denied: missing or invalid operator assertion.",
          killSwitch: getKillSwitchState(),
          liveControl: getMicroLiveControlSnapshot(),
        } satisfies ControlResponse);
      }

      if (Date.parse(assertion.expiresAt) <= Date.now()) {
        const context: ControlOperatorAuthContext = {
          identity: {
            actorId: assertion.actorId,
            displayName: assertion.displayName,
            role: assertion.role,
            sessionId: assertion.sessionId,
            issuedAt: assertion.issuedAt,
            expiresAt: assertion.expiresAt,
          },
          authResult: "denied",
          action: assertion.action,
          target: assertion.target,
          requestId: assertion.requestId ?? requestId,
          reason: "expired operator session",
        };
        void recordAuthFailure(deps, actionLabel, targetPath, "expired operator session", context, requestId);
        return reply.status(403).send({
          success: false,
          code: "control_auth_invalid",
          message: "Control routes denied: operator session has expired.",
          killSwitch: getKillSwitchState(),
          liveControl: getMicroLiveControlSnapshot(),
        } satisfies ControlResponse);
      }

      const identity: ControlOperatorIdentity = {
        actorId: assertion.actorId,
        displayName: assertion.displayName,
        role: assertion.role,
        sessionId: assertion.sessionId,
        issuedAt: assertion.issuedAt,
        expiresAt: assertion.expiresAt,
      };
      const requiredRole = requiredRoleForControlAction(routeAction.action);
      const authorized = assertion.authResult === "authorized" && canRolePerformControlAction(assertion.role, routeAction.action);
      if (!authorized) {
        const denialReason = assertion.authResult !== "authorized"
          ? assertion.reason ?? "operator assertion denied"
          : requiredRole
            ? `role '${assertion.role}' requires '${requiredRole}' for '${routeAction.action}'`
            : `role '${assertion.role}' cannot perform '${routeAction.action}'`;
        const context: ControlOperatorAuthContext = {
          identity,
          authResult: "denied",
          action: routeAction.action,
          target: routeAction.target,
          requestId: requestId ?? assertion.requestId,
          reason: denialReason,
        };
        void recordAuthFailure(deps, actionLabel, targetPath, denialReason, context, requestId ?? assertion.requestId);
        return reply.status(403).send({
          success: false,
          code: "control_auth_invalid",
          message: `Control routes denied: ${denialReason}.`,
          killSwitch: getKillSwitchState(),
          liveControl: getMicroLiveControlSnapshot(),
        } satisfies ControlResponse);
      }

      request.controlOperatorContext = {
        identity,
        authResult: "authorized",
        action: routeAction.action,
        target: routeAction.target,
        requestId: requestId ?? assertion.requestId,
      };
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

      const operatorContext = getOperatorContext(_request);
      const result = await runtimeConfigManager.setKillSwitch({
        action: "trigger",
        actor: operatorContext.identity.actorId,
        reason: "API emergency-stop",
      });
      const snapshot = await readControlSnapshot(deps);
      const readiness = toReadiness(snapshot.runtime);
      await recordOperatorAudit(deps, operatorContext, {
        action: "emergency_stop",
        target: "/control/emergency-stop",
        result: result.accepted ? "allowed" : "blocked",
        reason: "API emergency-stop",
        note: result.message,
        requestId: operatorContext.requestId,
      });
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

      const operatorContext = getOperatorContext(request);
      if (await denyWhenKillSwitchActive(deps, operatorContext, "/control/pause", "pause", reply)) {
        return;
      }
      const body = (request.body ?? {}) as { scope?: "soft" | "hard"; reason?: string };
      const scope = body.scope ?? "soft";
      const reason = body.reason ?? `${scope} pause`;
      const result = await runtimeConfigManager.setPause({
        scope,
        actor: operatorContext.identity.actorId,
        reason,
      });
      const snapshot = await readControlSnapshot(deps);
      await recordOperatorAudit(deps, operatorContext, {
        action: "pause",
        target: "/control/pause",
        result: result.accepted ? "allowed" : "blocked",
        reason,
        note: result.message,
        requestId: operatorContext.requestId,
      });
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

      const operatorContext = getOperatorContext(request);
      if (await denyWhenKillSwitchActive(deps, operatorContext, "/control/resume", "resume", reply)) {
        return;
      }
      const body = (request.body ?? {}) as { reason?: string };
      const result = await runtimeConfigManager.resume({
        actor: operatorContext.identity.actorId,
        reason: body.reason ?? "api_resume",
      });
      const snapshot = await readControlSnapshot(deps);
      await recordOperatorAudit(deps, operatorContext, {
        action: "resume",
        target: "/control/resume",
        result: result.accepted ? "allowed" : "blocked",
        reason: body.reason ?? "api_resume",
        note: result.message,
        requestId: operatorContext.requestId,
      });
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

      const operatorContext = getOperatorContext(_request);
      const result = await runtimeConfigManager.setKillSwitch({
        action: "trigger",
        actor: operatorContext.identity.actorId,
        reason: "API halt",
      });
      const snapshot = await readControlSnapshot(deps);
      await recordOperatorAudit(deps, operatorContext, {
        action: "emergency_stop",
        target: "/control/halt",
        result: result.accepted ? "allowed" : "blocked",
        reason: "API halt",
        note: result.message,
        requestId: operatorContext.requestId,
      });
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

      const operatorContext = getOperatorContext(_request);
      const result = await runtimeConfigManager.setKillSwitch({
        action: "reset",
        actor: operatorContext.identity.actorId,
        reason: "API reset",
      });
      const snapshot = await readControlSnapshot(deps);
      await recordOperatorAudit(deps, operatorContext, {
        action: "reset_kill_switch",
        target: "/control/reset",
        result: result.accepted ? "allowed" : "blocked",
        reason: "API reset",
        note: result.message,
        requestId: operatorContext.requestId,
      });
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
      const databaseRehearsal = await buildDatabaseRehearsalGateForSnapshot(deps, snapshot);
      const databaseRehearsalStatus = await buildDatabaseRehearsalStatusForSnapshot(deps, snapshot);
      return reply
        .status(200)
        .send(buildRuntimeConfigStatusResponse(snapshot, toReadiness(snapshot.runtime), databaseRehearsal, databaseRehearsalStatus));
    });

    fastify.get<{ Reply: OperatorReleaseGateResponse | ControlResponse }>("/control/release-gate", async (_request, reply) => {
      if (!runtimeConfigManager) {
        return reply.status(503).send({
          success: false,
          message: "Release gate unavailable: config manager is not wired.",
          killSwitch: getKillSwitchState(),
          liveControl: getMicroLiveControlSnapshot(),
        });
      }

      const snapshot = await readControlSnapshot(deps);
      const readiness = toReadiness(snapshot.runtime);
      return reply.status(200).send(buildOperatorReleaseGateResponse(snapshot, readiness));
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
      const databaseRehearsal = await buildDatabaseRehearsalGateForSnapshot(deps, snapshot);
      const databaseRehearsalStatus = await buildDatabaseRehearsalStatusForSnapshot(deps, snapshot);
      return reply
        .status(200)
        .send(buildRuntimeConfigStatusResponse(snapshot, toReadiness(snapshot.runtime), databaseRehearsal, databaseRehearsalStatus));
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

      const operatorContext = getOperatorContext(request);
      if (await denyWhenKillSwitchActive(deps, operatorContext, "/control/mode", "mode_change", reply)) {
        return;
      }
      const requestedMode = request.body.mode;
      if (requestedMode === "live" || requestedMode === "live_limited") {
        const message = "Direct live mode changes are governed by the live promotion workflow.";
        const status = runtimeConfigManager.getRuntimeConfigStatus();
        await recordOperatorAudit(deps, operatorContext, {
          action: "mode_change",
          target: "/control/mode",
          result: "blocked",
          reason: request.body.reason ?? message,
          note: message,
          requestId: operatorContext.requestId,
          metadata: {
            requestedMode,
          },
        });
        return reply.status(409).send({
          success: false,
          accepted: false,
          action: "mode",
          message,
          rejectionReason: "live promotion governance required",
          pendingApply: status.pendingApply,
          requiresRestart: status.requiresRestart,
          reloadNonce: status.reloadNonce,
          status,
          killSwitch: getKillSwitchState(),
          liveControl: getMicroLiveControlSnapshot(),
        } satisfies RuntimeConfigMutationResponse);
      }

      const result = await runtimeConfigManager.setMode(requestedMode, {
        actor: operatorContext.identity.actorId,
        reason: request.body.reason ?? `mode set to ${requestedMode}`,
      });
      const snapshot = await readControlSnapshot(deps);
      await recordOperatorAudit(deps, operatorContext, {
        action: "mode_change",
        target: "/control/mode",
        result: result.accepted ? "allowed" : "blocked",
        reason: request.body.reason ?? `mode set to ${requestedMode}`,
        note: result.message,
        requestId: operatorContext.requestId,
        metadata: {
          requestedMode,
        },
      });
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

      const operatorContext = getOperatorContext(request);
      if (await denyWhenKillSwitchActive(deps, operatorContext, "/control/runtime-config", "runtime_config_change", reply)) {
        return;
      }
      const result = await runtimeConfigManager.applyBehaviorPatch({
        patch: request.body.patch as never,
        actor: operatorContext.identity.actorId,
        reason: request.body.reason ?? "runtime config patch",
      });
      const snapshot = await readControlSnapshot(deps);
      await recordOperatorAudit(deps, operatorContext, {
        action: "runtime_config_change",
        target: "/control/runtime-config",
        result: result.accepted ? "allowed" : "blocked",
        reason: request.body.reason ?? "runtime config patch",
        note: result.message,
        requestId: operatorContext.requestId,
      });
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

      const operatorContext = getOperatorContext(request);
      if (await denyWhenKillSwitchActive(deps, operatorContext, "/control/reload", "reload", reply)) {
        return;
      }
      const result = await runtimeConfigManager.reload({
        actor: operatorContext.identity.actorId,
        reason: request.body.reason ?? "control_api_reload",
      });
      const snapshot = await readControlSnapshot(deps);
      await recordOperatorAudit(deps, operatorContext, {
        action: "reload",
        target: "/control/reload",
        result: result.accepted ? "allowed" : "blocked",
        reason: request.body.reason ?? "control_api_reload",
        note: result.message,
        requestId: operatorContext.requestId,
      });
      return reply.status(result.accepted ? 200 : 409).send(buildMutationResponse(result, snapshot));
    });

    fastify.get<{
      Querystring: { targetMode?: string; limit?: string };
      Reply: LivePromotionResponse | ControlResponse;
    }>("/control/live-promotion", async (request, reply) => {
      if (!governanceRepository) {
        return reply.status(503).send({
          success: false,
          message: "Live promotion governance is unavailable: governance repository is not wired.",
          killSwitch: getKillSwitchState(),
          liveControl: getMicroLiveControlSnapshot(),
        });
      }

      const snapshot = await readControlSnapshot(deps);
      const targetMode: ControlLivePromotionTargetMode = request.query.targetMode === "live" ? "live" : "live_limited";
      const gate = await evaluateLivePromotionGateWithRehearsalEvidence(deps, snapshot, targetMode);
      const limit = request.query.limit && /^\d+$/.test(request.query.limit) ? Math.min(Math.max(Number.parseInt(request.query.limit, 10), 1), 50) : 10;
      const requests = await governanceRepository.listLivePromotionRequests(
        snapshot.runtimeConfig.environment ?? deps.runtimeEnvironment ?? "development",
        limit
      );

      return reply.status(200).send({
        success: true,
        gate,
        currentMode: snapshot.runtimeConfig.appliedMode ?? snapshot.runtimeConfig.requestedMode ?? "unknown",
        currentRuntimeStatus: snapshot.runtime?.status ?? "unknown",
        requests,
      });
    });

    fastify.post<{
      Body: { targetMode: ControlLivePromotionTargetMode; reason?: string };
      Reply: LivePromotionRequestResponse | ControlResponse;
    }>("/control/live-promotion/request", async (request, reply) => {
      if (!governanceRepository || !runtimeConfigManager) {
        return reply.status(503).send({
          success: false,
          accepted: false,
          message: "Live promotion request unavailable: governance repository or runtime config manager is not wired.",
          killSwitch: getKillSwitchState(),
          liveControl: getMicroLiveControlSnapshot(),
        } as ControlResponse);
      }

      const operatorContext = getOperatorContext(request);
      if (
        await denyWhenKillSwitchActive(
          deps,
          operatorContext,
          "/control/live-promotion/request",
          "live_promotion_request",
          reply
        )
      ) {
        return;
      }
      const body = (request.body ?? {}) as { targetMode?: ControlLivePromotionTargetMode; reason?: string };
      const targetMode = body.targetMode;
      if (targetMode !== "live_limited" && targetMode !== "live") {
        return reply.status(400).send({
          success: false,
          accepted: false,
          message: "Live promotion target mode must be 'live_limited' or 'live'.",
          reason: "invalid target mode",
        });
      }

      const snapshot = await readControlSnapshot(deps);
      const gate = await evaluateLivePromotionGateWithRehearsalEvidence(deps, snapshot, targetMode);
      const requestReason = body.reason ?? `request ${targetMode}`;
      const record = buildLivePromotionRecord({
        environment: snapshot.runtimeConfig.environment ?? deps.runtimeEnvironment ?? "development",
        gate,
        context: operatorContext,
        targetMode,
        previousMode: snapshot.runtimeConfig.appliedMode ?? snapshot.runtimeConfig.requestedMode ?? "unknown",
        requestReason,
        workflowStatus: gate.allowed ? "pending" : "blocked",
        applicationStatus: gate.allowed ? "pending_restart" : "rejected",
        blockedReason: gate.allowed ? undefined : gate.reasons.map((reason) => `${reason.code}: ${reason.message}`).join("; "),
        updatedAt: new Date().toISOString(),
      });

      await governanceRepository.saveLivePromotionRequest(record);
      await recordOperatorAudit(deps, operatorContext, {
        action: "promotion_request",
        target: `/control/live-promotion/request:${targetMode}`,
        result: gate.allowed ? "requested" : "blocked",
        reason: requestReason,
        note: gate.allowed ? "Promotion request accepted." : record.blockedReason,
        requestId: record.id,
        metadata: { gate, targetMode },
      });

      return reply.status(gate.allowed ? 201 : 409).send({
        success: gate.allowed,
        accepted: gate.allowed,
        message: gate.allowed ? "Live promotion request accepted." : "Live promotion request blocked.",
        request: record,
        gate,
      });
    });

    fastify.post<{
      Params: { id: string };
      Body: { reason?: string };
      Reply: LivePromotionRequestResponse | ControlResponse;
    }>("/control/live-promotion/:id/approve", async (request, reply) => {
      if (!governanceRepository || !runtimeConfigManager) {
        return reply.status(503).send({
          success: false,
          accepted: false,
          message: "Live promotion approval unavailable: governance repository or runtime config manager is not wired.",
          killSwitch: getKillSwitchState(),
          liveControl: getMicroLiveControlSnapshot(),
        } as ControlResponse);
      }

      const operatorContext = getOperatorContext(request);
      if (
        await denyWhenKillSwitchActive(
          deps,
          operatorContext,
          `/control/live-promotion/${request.params.id}/approve`,
          "live_promotion_approve",
          reply
        )
      ) {
        return;
      }
      const record = await governanceRepository.loadLivePromotionRequest(request.params.id);
      if (!record) {
        return reply.status(404).send({
          success: false,
          accepted: false,
          message: "Live promotion request not found.",
          reason: "not found",
        });
      }

      const snapshot = await readControlSnapshot(deps);
      const gate = await evaluateLivePromotionGateWithRehearsalEvidence(deps, snapshot, record.targetMode);
      if (!gate.allowed) {
        const blockedRecord = mergeLivePromotionRecord(record, {
          workflowStatus: "blocked",
          applicationStatus: "rejected",
          blockedReason: gate.reasons.map((reason) => `${reason.code}: ${reason.message}`).join("; "),
          updatedAt: new Date().toISOString(),
        });
        await governanceRepository.saveLivePromotionRequest(blockedRecord);
        await recordOperatorAudit(deps, operatorContext, {
          action: "promotion_decision",
          target: `/control/live-promotion/${record.id}/approve`,
          result: "blocked",
          reason: request.body?.reason,
          note: blockedRecord.blockedReason,
          requestId: record.id,
          metadata: { gate, requestedTarget: record.targetMode },
        });
        return reply.status(409).send({
          success: false,
          accepted: false,
          message: "Live promotion approval blocked by gate checks.",
          request: blockedRecord,
          gate,
          reason: blockedRecord.blockedReason,
        });
      }

      const approvedRecord = mergeLivePromotionRecord(record, {
        workflowStatus: "approved",
        applicationStatus: "pending_restart",
        approvalReason: request.body?.reason ?? "promotion approved",
        approvedByActorId: operatorContext.identity.actorId,
        approvedByDisplayName: operatorContext.identity.displayName,
        approvedByRole: operatorContext.identity.role,
        approvedBySessionId: operatorContext.identity.sessionId,
        approvedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      await governanceRepository.saveLivePromotionRequest(approvedRecord);
      await recordOperatorAudit(deps, operatorContext, {
        action: "promotion_decision",
        target: `/control/live-promotion/${record.id}/approve`,
        result: "approved",
        reason: request.body?.reason,
        note: approvedRecord.approvalReason,
        requestId: record.id,
        metadata: { requestedTarget: record.targetMode },
      });
      return reply.status(200).send({
        success: true,
        accepted: true,
        message: "Live promotion approved.",
        request: approvedRecord,
        gate,
      });
    });

    fastify.post<{
      Params: { id: string };
      Body: { reason?: string };
      Reply: LivePromotionRequestResponse | ControlResponse;
    }>("/control/live-promotion/:id/deny", async (request, reply) => {
      if (!governanceRepository) {
        return reply.status(503).send({
          success: false,
          accepted: false,
          message: "Live promotion denial unavailable: governance repository is not wired.",
          killSwitch: getKillSwitchState(),
          liveControl: getMicroLiveControlSnapshot(),
        } as ControlResponse);
      }

      const operatorContext = getOperatorContext(request);
      if (
        await denyWhenKillSwitchActive(
          deps,
          operatorContext,
          `/control/live-promotion/${request.params.id}/deny`,
          "live_promotion_deny",
          reply
        )
      ) {
        return;
      }
      const record = await governanceRepository.loadLivePromotionRequest(request.params.id);
      if (!record) {
        return reply.status(404).send({
          success: false,
          accepted: false,
          message: "Live promotion request not found.",
          reason: "not found",
        });
      }

      const deniedRecord = mergeLivePromotionRecord(record, {
        workflowStatus: "denied",
        applicationStatus: "rejected",
        approvalReason: undefined,
        blockedReason: request.body?.reason ?? "promotion denied",
        deniedByActorId: operatorContext.identity.actorId,
        deniedByDisplayName: operatorContext.identity.displayName,
        deniedByRole: operatorContext.identity.role,
        deniedBySessionId: operatorContext.identity.sessionId,
        deniedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      await governanceRepository.saveLivePromotionRequest(deniedRecord);
      await recordOperatorAudit(deps, operatorContext, {
        action: "promotion_decision",
        target: `/control/live-promotion/${record.id}/deny`,
        result: "denied",
        reason: request.body?.reason,
        note: deniedRecord.blockedReason,
        requestId: record.id,
        metadata: { requestedTarget: record.targetMode },
      });
      return reply.status(200).send({
        success: true,
        accepted: true,
        message: "Live promotion denied.",
        request: deniedRecord,
      });
    });

    fastify.post<{
      Params: { id: string };
      Body: { reason?: string };
      Reply: LivePromotionRequestResponse | ControlResponse;
    }>("/control/live-promotion/:id/apply", async (request, reply) => {
      if (!governanceRepository || !runtimeConfigManager) {
        return reply.status(503).send({
          success: false,
          accepted: false,
          message: "Live promotion application unavailable: governance repository or runtime config manager is not wired.",
          killSwitch: getKillSwitchState(),
          liveControl: getMicroLiveControlSnapshot(),
        } as ControlResponse);
      }

      const operatorContext = getOperatorContext(request);
      if (
        await denyWhenKillSwitchActive(
          deps,
          operatorContext,
          `/control/live-promotion/${request.params.id}/apply`,
          "live_promotion_apply",
          reply
        )
      ) {
        return;
      }
      const record = await governanceRepository.loadLivePromotionRequest(request.params.id);
      if (!record) {
        return reply.status(404).send({
          success: false,
          accepted: false,
          message: "Live promotion request not found.",
          reason: "not found",
        });
      }

      if (record.workflowStatus !== "approved") {
        return reply.status(409).send({
          success: false,
          accepted: false,
          message: "Live promotion must be approved before it can be applied.",
          request: record,
          reason: "approval required",
        });
      }

      const snapshot = await readControlSnapshot(deps);
      const gate = await evaluateLivePromotionGateWithRehearsalEvidence(deps, snapshot, record.targetMode);
      if (!gate.allowed) {
        const blockedRecord = mergeLivePromotionRecord(record, {
          workflowStatus: "blocked",
          applicationStatus: "rejected",
          blockedReason: gate.reasons.map((reason) => `${reason.code}: ${reason.message}`).join("; "),
          updatedAt: new Date().toISOString(),
        });
        await governanceRepository.saveLivePromotionRequest(blockedRecord);
        await recordOperatorAudit(deps, operatorContext, {
          action: "promotion_apply",
          target: `/control/live-promotion/${record.id}/apply`,
          result: "blocked",
          reason: request.body?.reason,
          note: blockedRecord.blockedReason,
          requestId: record.id,
          metadata: { gate, requestedTarget: record.targetMode },
        });
        return reply.status(409).send({
          success: false,
          accepted: false,
          message: "Live promotion application blocked by gate checks.",
          request: blockedRecord,
          gate,
          reason: blockedRecord.blockedReason,
        });
      }

      const result = await runtimeConfigManager.setMode(record.targetMode, {
        actor: operatorContext.identity.actorId,
        reason: request.body?.reason ?? record.requestReason,
      });
      const appliedRecord = mergeLivePromotionRecord(record, {
        workflowStatus: "applied",
        applicationStatus: result.requiresRestart || result.pendingApply ? "pending_restart" : "applied",
        approvalReason: request.body?.reason ?? record.approvalReason,
        appliedByActorId: operatorContext.identity.actorId,
        appliedByDisplayName: operatorContext.identity.displayName,
        appliedByRole: operatorContext.identity.role,
        appliedBySessionId: operatorContext.identity.sessionId,
        appliedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      await governanceRepository.saveLivePromotionRequest(appliedRecord);
      await recordOperatorAudit(deps, operatorContext, {
        action: "promotion_apply",
        target: `/control/live-promotion/${record.id}/apply`,
        result: "applied",
        reason: request.body?.reason ?? record.requestReason,
        note: result.message,
        requestId: record.id,
        metadata: {
          requestedTarget: record.targetMode,
          requiresRestart: result.requiresRestart,
          pendingApply: result.pendingApply,
        },
      });
      return reply.status(result.accepted ? 200 : 409).send({
        success: result.accepted,
        accepted: result.accepted,
        message: result.message,
        request: appliedRecord,
        gate,
        reason: result.rejectionReason,
      });
    });

    fastify.post<{
      Params: { id: string };
      Body: { reason?: string };
      Reply: LivePromotionRequestResponse | ControlResponse;
    }>("/control/live-promotion/:id/rollback", async (request, reply) => {
      if (!governanceRepository || !runtimeConfigManager) {
        return reply.status(503).send({
          success: false,
          accepted: false,
          message: "Live promotion rollback unavailable: governance repository or runtime config manager is not wired.",
          killSwitch: getKillSwitchState(),
          liveControl: getMicroLiveControlSnapshot(),
        } as ControlResponse);
      }

      const operatorContext = getOperatorContext(request);
      if (
        await denyWhenKillSwitchActive(
          deps,
          operatorContext,
          `/control/live-promotion/${request.params.id}/rollback`,
          "live_promotion_rollback",
          reply
        )
      ) {
        return;
      }
      const record = await governanceRepository.loadLivePromotionRequest(request.params.id);
      if (!record) {
        return reply.status(404).send({
          success: false,
          accepted: false,
          message: "Live promotion request not found.",
          reason: "not found",
        });
      }

      if (record.workflowStatus !== "applied") {
        return reply.status(409).send({
          success: false,
          accepted: false,
          message: "Live promotion rollback is only available after application.",
          request: record,
          reason: "application required",
        });
      }

      const result = await runtimeConfigManager.setMode(record.previousMode as RuntimeMode, {
        actor: operatorContext.identity.actorId,
        reason: request.body?.reason ?? record.rollbackReason ?? `rollback to ${record.previousMode}`,
      });
      const rolledBackRecord = mergeLivePromotionRecord(record, {
        workflowStatus: "rolled_back",
        applicationStatus: "rolled_back",
        rollbackReason: request.body?.reason ?? `rollback to ${record.previousMode}`,
        rolledBackByActorId: operatorContext.identity.actorId,
        rolledBackByDisplayName: operatorContext.identity.displayName,
        rolledBackByRole: operatorContext.identity.role,
        rolledBackBySessionId: operatorContext.identity.sessionId,
        rolledBackAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      await governanceRepository.saveLivePromotionRequest(rolledBackRecord);
      await recordOperatorAudit(deps, operatorContext, {
        action: "promotion_rollback",
        target: `/control/live-promotion/${record.id}/rollback`,
        result: result.accepted ? "rolled_back" : "blocked",
        reason: request.body?.reason,
        note: result.message,
        requestId: record.id,
        metadata: {
          previousMode: record.previousMode,
        },
      });
      return reply.status(result.accepted ? 200 : 409).send({
        success: result.accepted,
        accepted: result.accepted,
        message: result.message,
        request: rolledBackRecord,
        reason: result.rejectionReason,
      });
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

      const operatorContext = getOperatorContext(request);
      const body = (request.body ?? {}) as { reason?: string };
      const idempotencyKey = request.headers["x-idempotency-key"];
      const result = await deps.restartService.requestRestart({
        actor: operatorContext.identity.actorId,
        reason: body.reason,
        idempotencyKey: typeof idempotencyKey === "string" ? idempotencyKey : undefined,
      });
      await recordOperatorAudit(deps, operatorContext, {
        action: "restart_worker",
        target: "/control/restart-worker",
        result: result.accepted ? "allowed" : "blocked",
        reason: body.reason,
        note: result.message,
        requestId: operatorContext.requestId,
        metadata: {
          targetService: result.targetService,
          orchestrationMethod: result.orchestrationMethod,
          targetVersionId: result.targetVersionId,
        },
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

    fastify.get<{
      Querystring: Record<string, string | undefined>;
      Reply: RestartAlertDeliveriesResponse | ControlResponse;
    }>("/control/restart-alert-deliveries", async (request, reply) => {
      if (!deps.restartAlertRepository) {
        return reply.status(503).send({
          success: false,
          message: "Restart delivery journal unavailable: alert repository is not wired.",
          killSwitch: getKillSwitchState(),
          liveControl: getMicroLiveControlSnapshot(),
        });
      }

      try {
        const filters = buildDeliveryFilters(request.query, { windowMs: 7 * 24 * 60 * 60 * 1000, limit: 50 });
        const journal = await deps.restartAlertRepository.listDeliveryJournal(filters);
        return reply.status(200).send({
          success: true,
          ...journal,
        });
      } catch (error) {
        return reply.status(400).send({
          success: false,
          message: error instanceof Error ? error.message : "invalid delivery journal query",
          killSwitch: getKillSwitchState(),
          liveControl: getMicroLiveControlSnapshot(),
        });
      }
    });

    fastify.get<{
      Querystring: Record<string, string | undefined>;
      Reply: RestartAlertDeliveriesSummaryResponse | ControlResponse;
    }>("/control/restart-alert-deliveries/summary", async (request, reply) => {
      if (!deps.restartAlertRepository) {
        return reply.status(503).send({
          success: false,
          message: "Restart delivery summary unavailable: alert repository is not wired.",
          killSwitch: getKillSwitchState(),
          liveControl: getMicroLiveControlSnapshot(),
        });
      }

      try {
        const filters = buildDeliveryFilters(request.query, { windowMs: 24 * 60 * 60 * 1000, limit: 50 });
        const summary = await deps.restartAlertRepository.summarizeDeliveryJournal(filters);
        return reply.status(200).send({
          success: true,
          ...summary,
        });
      } catch (error) {
        return reply.status(400).send({
          success: false,
          message: error instanceof Error ? error.message : "invalid delivery summary query",
          killSwitch: getKillSwitchState(),
          liveControl: getMicroLiveControlSnapshot(),
        });
      }
    });

    fastify.get<{
      Querystring: Record<string, string | undefined>;
      Reply: RestartAlertDeliveryTrendsResponse | ControlResponse;
    }>("/control/restart-alert-deliveries/trends", async (request, reply) => {
      if (!deps.restartAlertRepository) {
        return reply.status(503).send({
          success: false,
          message: "Restart delivery trends unavailable: alert repository is not wired.",
          killSwitch: getKillSwitchState(),
          liveControl: getMicroLiveControlSnapshot(),
        });
      }

      try {
        const filters = buildTrendFilters(request.query);
        const trends = await deps.restartAlertRepository.summarizeDeliveryTrends(filters);
        return reply.status(200).send({
          success: true,
          ...trends,
        });
      } catch (error) {
        return reply.status(400).send({
          success: false,
          message: error instanceof Error ? error.message : "invalid delivery trends query",
          killSwitch: getKillSwitchState(),
          liveControl: getMicroLiveControlSnapshot(),
        });
      }
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

      const operatorContext = getOperatorContext(request);
      const result = await deps.restartService.acknowledgeRestartAlert(request.params.id, {
        actor: operatorContext.identity.actorId,
        note: request.body?.note,
      });
      await recordOperatorAudit(deps, operatorContext, {
        action: "acknowledge_restart_alert",
        target: `/control/restart-alerts/${request.params.id}/acknowledge`,
        result: result.accepted ? "allowed" : "blocked",
        reason: request.body?.note,
        note: result.message,
        requestId: operatorContext.requestId,
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

      const operatorContext = getOperatorContext(request);
      const result = await deps.restartService.resolveRestartAlert(request.params.id, {
        actor: operatorContext.identity.actorId,
        note: request.body?.note,
      });
      await recordOperatorAudit(deps, operatorContext, {
        action: "resolve_restart_alert",
        target: `/control/restart-alerts/${request.params.id}/resolve`,
        result: result.accepted ? "allowed" : "blocked",
        reason: request.body?.note,
        note: result.message,
        requestId: operatorContext.requestId,
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
