/**
 * Runtime control routes.
 */
import type { FastifyPluginAsync, FastifyReply } from "fastify";
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
  ControlAuditEvent,
  ControlGovernanceRepositoryWithAudits,
  ControlLivePromotionGate,
  ControlLivePromotionRecord,
  ControlOperatorAssertion,
  ControlOperatorAuthContext,
  ControlOperatorIdentity,
  ControlAction,
  ControlLivePromotionTargetMode,
  ControlRecoveryRehearsalOperationalStatus,
  ControlRecoveryRehearsalEvidenceRecord,
  ControlRecoveryRehearsalGate,
} from "../../control/control-governance.js";
import {
  CONTROL_OPERATOR_ASSERTION_HEADER,
  buildControlAuditActor,
  buildAuditEventId,
  buildDatabaseRehearsalFreshnessStatus,
  canRolePerformControlAction,
  classifyControlAction,
  evaluateDatabaseRehearsalGate,
  evaluateLivePromotionGate,
  parseControlOperatorAssertion,
  requiredRoleForControlAction,
  syncDatabaseRehearsalFreshnessState,
} from "../../control/control-governance.js";
import type { WorkerRestartMethod, WorkerRestartRequestRecord } from "../../persistence/worker-restart-repository.js";
import type {
  WorkerRestartAlertNotificationEventType,
  WorkerRestartAlertNotificationStatus,
  WorkerRestartAlertSeverity,
  WorkerRestartAlertRepository,
  WorkerRestartDeliveryJournalFilters,
  WorkerRestartDeliveryJournalResult,
  WorkerRestartDeliverySummaryResult,
  WorkerRestartDeliveryTrendFilters,
  WorkerRestartDeliveryTrendResult,
} from "../../persistence/worker-restart-alert-repository.js";
import type { RuntimeVisibilityRepository } from "../../persistence/runtime-visibility-repository.js";
import type { RuntimeConfigManager } from "../../runtime/runtime-config-manager.js";
import type { RuntimeSnapshot } from "../../runtime/dry-run-runtime.js";
import type { RuntimeReadiness } from "../contracts/kpi.js";

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

function resolveRequestPath(url: string): string {
  try {
    return new URL(url, "http://control.local").pathname;
  } catch {
    return url.split("?")[0] ?? url;
  }
}

function resolveRequestId(headers: Record<string, unknown>): string | undefined {
  const requestId = headers["x-request-id"];
  return typeof requestId === "string" && requestId.length > 0 ? requestId : undefined;
}

function isReadOnlyControlRequest(method: string): boolean {
  return method === "GET" || method === "HEAD";
}

function isControlMutation(method: string, targetPath: string): boolean {
  if (method === "GET" || method === "HEAD") {
    return false;
  }
  return Boolean(classifyControlAction(targetPath));
}

async function recordAuthFailure(
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

function getOperatorContext(request: import("fastify").FastifyRequest): ControlOperatorAuthContext {
  if (!request.controlOperatorContext) {
    throw new Error("operator context missing after authorization");
  }

  return request.controlOperatorContext;
}

function buildLivePromotionRecord(input: {
  environment: string;
  gate: ControlLivePromotionGate;
  context: ControlOperatorAuthContext;
  targetMode: ControlLivePromotionTargetMode;
  previousMode: string;
  requestReason: string;
  workflowStatus: ControlLivePromotionRecord["workflowStatus"];
  applicationStatus: ControlLivePromotionRecord["applicationStatus"];
  blockedReason?: string;
  approvalReason?: string;
  rollbackReason?: string;
  approved?: boolean;
  denied?: boolean;
  applied?: boolean;
  rolledBack?: boolean;
  requestedAt?: string;
  updatedAt?: string;
}): ControlLivePromotionRecord {
  const now = input.updatedAt ?? new Date().toISOString();
  return {
    id: input.context.requestId ?? buildAuditEventId(),
    environment: input.environment,
    targetMode: input.targetMode,
    previousMode: input.previousMode,
    workflowStatus: input.workflowStatus,
    applicationStatus: input.applicationStatus,
    requestReason: input.requestReason,
    blockedReason: input.blockedReason,
    approvalReason: input.approvalReason,
    rollbackReason: input.rollbackReason,
    requestedByActorId: input.context.identity.actorId,
    requestedByDisplayName: input.context.identity.displayName,
    requestedByRole: input.context.identity.role,
    requestedBySessionId: input.context.identity.sessionId,
    requestedAt: input.requestedAt ?? now,
    approvedByActorId: input.approved ? input.context.identity.actorId : undefined,
    approvedByDisplayName: input.approved ? input.context.identity.displayName : undefined,
    approvedByRole: input.approved ? input.context.identity.role : undefined,
    approvedBySessionId: input.approved ? input.context.identity.sessionId : undefined,
    approvedAt: input.approved ? now : undefined,
    deniedByActorId: input.denied ? input.context.identity.actorId : undefined,
    deniedByDisplayName: input.denied ? input.context.identity.displayName : undefined,
    deniedByRole: input.denied ? input.context.identity.role : undefined,
    deniedBySessionId: input.denied ? input.context.identity.sessionId : undefined,
    deniedAt: input.denied ? now : undefined,
    appliedByActorId: input.applied ? input.context.identity.actorId : undefined,
    appliedByDisplayName: input.applied ? input.context.identity.displayName : undefined,
    appliedByRole: input.applied ? input.context.identity.role : undefined,
    appliedBySessionId: input.applied ? input.context.identity.sessionId : undefined,
    appliedAt: input.applied ? now : undefined,
    rolledBackByActorId: input.rolledBack ? input.context.identity.actorId : undefined,
    rolledBackByDisplayName: input.rolledBack ? input.context.identity.displayName : undefined,
    rolledBackByRole: input.rolledBack ? input.context.identity.role : undefined,
    rolledBackBySessionId: input.rolledBack ? input.context.identity.sessionId : undefined,
    rolledBackAt: input.rolledBack ? now : undefined,
    gateSnapshot: input.gate,
    updatedAt: now,
  };
}

function mergeLivePromotionRecord(
  record: ControlLivePromotionRecord,
  patch: Partial<ControlLivePromotionRecord>
): ControlLivePromotionRecord {
  return {
    ...record,
    ...patch,
    gateSnapshot: patch.gateSnapshot ?? record.gateSnapshot,
    updatedAt: patch.updatedAt ?? new Date().toISOString(),
  };
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

async function denyWhenKillSwitchActive(
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

async function recordOperatorAudit(
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
  readiness?: RuntimeReadiness,
  databaseRehearsal?: ControlRecoveryRehearsalGate,
  databaseRehearsalStatus?: ControlRecoveryRehearsalOperationalStatus
): RuntimeConfigStatusResponse {
  return {
    success: true,
    runtime: snapshot.runtime,
    worker: snapshot.worker,
    runtimeConfig: snapshot.runtimeConfig,
    controlView: snapshot.controlView,
    restart: snapshot.restart,
    restartAlerts: snapshot.restartAlerts,
    databaseRehearsal,
    databaseRehearsalStatus,
    readiness,
    killSwitch: getKillSwitchState(),
    liveControl: getMicroLiveControlSnapshot(),
  };
}

function toReadiness(runtime?: RuntimeSnapshot): RuntimeReadiness | undefined {
  return buildRuntimeReadiness(runtime);
}

function canArmMicroLiveReleaseGate(snapshot: WorkerRestartSnapshot, readiness?: RuntimeReadiness): boolean {
  const liveControl = snapshot.runtime?.liveControl ?? getMicroLiveControlSnapshot();
  return Boolean(
    readiness &&
      liveControl.liveEnabled === true &&
      liveControl.rolloutPosture === "micro_live" &&
      liveControl.rolloutConfigValid !== false &&
      liveControl.rolloutConfigured &&
      liveControl.killSwitchActive !== true &&
      liveControl.blocked !== true &&
      liveControl.roundStatus !== "failed" &&
      liveControl.roundStatus !== "stopped" &&
      liveControl.roundStatus !== "completed" &&
      snapshot.runtime?.status !== "error" &&
      snapshot.runtime?.adapterHealth?.degraded !== true
  );
}

function canUseStagedLiveCandidateReleaseGate(snapshot: WorkerRestartSnapshot, readiness?: RuntimeReadiness): boolean {
  const liveControl = snapshot.runtime?.liveControl ?? getMicroLiveControlSnapshot();
  return Boolean(
    readiness &&
      liveControl.liveEnabled === true &&
      liveControl.rolloutPosture === "staged_live_candidate" &&
      liveControl.rolloutConfigValid !== false &&
      liveControl.rolloutConfigured &&
      liveControl.killSwitchActive !== true &&
      liveControl.blocked !== true &&
      snapshot.runtime?.status !== "error" &&
      snapshot.runtime?.adapterHealth?.degraded !== true &&
      snapshot.runtime?.degradedState?.active !== true
  );
}

function deriveOperatorReleaseStage(snapshot: WorkerRestartSnapshot, readiness?: RuntimeReadiness): OperatorReleaseStage {
  if (!readiness) {
    return "blocked";
  }
  if (canUseStagedLiveCandidateReleaseGate(snapshot, readiness)) {
    return "constrained_live";
  }
  if (canArmMicroLiveReleaseGate(snapshot, readiness)) {
    return "micro_live";
  }
  if (readiness.paperSafe) {
    return "paper_safe";
  }
  return "blocked";
}

function buildOperatorEvidenceChecklist(): OperatorEvidenceChecklistItem[] {
  return [
    {
      id: "live-preflight",
      label: "Capture live preflight evidence",
      required: true,
      surfaceKind: "command",
      surfaceRef: "npm --prefix bot run live:preflight",
      note: "Creates the persisted live-preflight evidence sidecar next to JOURNAL_PATH.",
    },
    {
      id: "worker-state",
      label: "Capture boot-critical worker state",
      required: true,
      surfaceKind: "command",
      surfaceRef: "npm --prefix bot run recovery:worker-state",
      note: "Use the boot-critical artifact report before any rollout decision.",
    },
    {
      id: "health-surface",
      label: "Inspect runtime health",
      required: true,
      surfaceKind: "route",
      surfaceRef: "GET /health",
    },
    {
      id: "control-status",
      label: "Inspect control and readiness state",
      required: true,
      surfaceKind: "route",
      surfaceRef: "GET /control/status",
    },
    {
      id: "release-gate",
      label: "Record the release-gate checklist surface",
      required: true,
      surfaceKind: "route",
      surfaceRef: "GET /control/release-gate",
    },
  ];
}

function buildIncidentRunbook(): OperatorIncidentProcedure[] {
  return [
    {
      id: "provider_outage",
      trigger: "Adapter health degrades or provider data becomes unavailable.",
      operatorAction: "Hold rollout, inspect GET /health and GET /kpi/adapters, then pause or stop live operation.",
      controlSurfaces: ["POST /control/pause", "POST /control/emergency-stop"],
      evidenceSurfaces: ["GET /health", "GET /kpi/adapters", "GET /control/status"],
    },
    {
      id: "signer_failure",
      trigger: "Signer URL or signer authorization fails during live-preflight or runtime start.",
      operatorAction: "Fail closed, stop live operation, and re-run live preflight after the signer boundary is restored.",
      controlSurfaces: ["POST /control/emergency-stop", "POST /control/halt"],
      evidenceSurfaces: ["GET /control/status", "GET /health", "npm --prefix bot run live:preflight"],
    },
    {
      id: "degraded_mode",
      trigger: "Runtime or adapter state degrades but paper-safe operation remains available.",
      operatorAction: "Keep live disabled, review readiness blockers, and resume only after explicit evidence-backed review.",
      controlSurfaces: ["POST /control/pause", "POST /control/resume"],
      evidenceSurfaces: ["GET /control/status", "GET /health"],
    },
    {
      id: "kill_switch",
      trigger: "Emergency stop or control halt is required.",
      operatorAction: "Use the emergency stop surface first, then preserve the audit trail and do not re-arm until review completes.",
      controlSurfaces: ["POST /control/emergency-stop", "POST /control/halt"],
      evidenceSurfaces: ["GET /control/status", "GET /health"],
    },
    {
      id: "rollback",
      trigger: "A live promotion must be reversed after application or a bad rollout must be reversed.",
      operatorAction: "Use the live-promotion rollback surface tied to the specific request id and record the rollback reason.",
      controlSurfaces: ["POST /control/live-promotion/:id/rollback"],
      evidenceSurfaces: ["GET /control/live-promotion", "GET /control/status"],
    },
  ];
}

function buildReleaseGateChecklist(
  snapshot: WorkerRestartSnapshot,
  readiness: RuntimeReadiness | undefined
): OperatorReleaseGateChecklistItem[] {
  const liveControl = snapshot.runtime?.liveControl ?? getMicroLiveControlSnapshot();
  const checklist: OperatorReleaseGateChecklistItem[] = [
    {
      id: "paper-safe",
      label: "Paper-safe runtime posture",
      status: readiness ? (readiness.paperSafe === false ? "fail" : "pass") : "manual_review_required",
      evidence: ["GET /health", "GET /control/status"],
      note: readiness ? (readiness.paperSafe === false ? "Runtime is not paper-safe." : undefined) : "Readiness is not available.",
    },
    {
      id: "explicit-rollout-stage",
      label: "Explicit rollout posture is set",
      status:
        liveControl.rolloutConfigured && liveControl.rolloutPosture !== "paused_or_rolled_back" ? "pass" : "fail",
      evidence: ["GET /control/status", "GET /control/release-gate"],
      note:
        liveControl.rolloutConfigured
          ? `Rollout posture is ${liveControl.rolloutPosture}.`
          : "Rollout posture is not explicitly configured.",
    },
    {
      id: "micro-live-gate",
      label: "Micro-live gate is available",
      status: canArmMicroLiveReleaseGate(snapshot, readiness) ? "pass" : readiness ? "fail" : "manual_review_required",
      evidence: ["GET /control/status", "GET /control/release-gate"],
      note: canArmMicroLiveReleaseGate(snapshot, readiness) ? "Micro-live can be armed." : "Micro-live remains blocked.",
    },
    {
      id: "staged-live-gate",
      label: "Staged-live candidate gate is available",
      status: canUseStagedLiveCandidateReleaseGate(snapshot, readiness) ? "pass" : readiness ? "fail" : "manual_review_required",
      evidence: ["GET /control/status", "GET /control/release-gate"],
      note: canUseStagedLiveCandidateReleaseGate(snapshot, readiness) ? "Staged-live candidate is eligible." : "Staged-live candidate remains blocked.",
    },
    {
      id: "kill-switch-clear",
      label: "Kill switch is not active",
      status: liveControl.killSwitchActive ? "fail" : "pass",
      evidence: ["GET /control/status", "GET /health"],
      note: liveControl.killSwitchActive ? "Emergency stop is active." : undefined,
    },
  ];

  if (readiness?.posture === "degraded_but_safe_in_paper") {
    checklist.push({
      id: "degraded-paper-safe",
      label: "Degraded mode is limited to paper-safe operation",
      status: "manual_review_required",
      evidence: ["GET /health", "GET /control/status"],
      note: "Degraded runtime requires operator review before any live progression.",
    });
  }

  return checklist;
}

function buildOperatorReleaseGateResponse(
  snapshot: WorkerRestartSnapshot,
  readiness: RuntimeReadiness | undefined
): OperatorReleaseGateResponse {
  const liveControl = snapshot.runtime?.liveControl ?? getMicroLiveControlSnapshot();
  const surfaceKind: OperatorReleaseGateResponse["surfaceKind"] =
    snapshot.runtime || snapshot.worker || snapshot.runtimeConfig ? "operational" : "unwired";
  const rolloutStage = deriveOperatorReleaseStage(snapshot, readiness);
  const checklist = buildReleaseGateChecklist(snapshot, readiness);
  return {
    success: true,
    surfaceKind,
    rolloutStage,
    readiness,
    releaseGate: {
      recommendedStage: rolloutStage,
      canArmMicroLive: canArmMicroLiveReleaseGate(snapshot, readiness),
      canUseStagedLiveCandidate: canUseStagedLiveCandidateReleaseGate(snapshot, readiness),
      blockers: readiness?.blockers ?? [],
      checklist,
    },
    operatorEvidenceChecklist: buildOperatorEvidenceChecklist(),
    incidentRunbook: buildIncidentRunbook(),
    killSwitch: getKillSwitchState(),
    liveControl,
  };
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

const DELIVERY_EVENT_TYPES = new Set<WorkerRestartAlertNotificationEventType>([
  "alert_opened",
  "alert_escalated",
  "alert_acknowledged",
  "alert_resolved",
  "alert_repeated_failure_summary",
]);
const DELIVERY_STATUSES = new Set<WorkerRestartAlertNotificationStatus>([
  "sent",
  "failed",
  "suppressed",
  "skipped",
  "pending",
]);
const DELIVERY_SEVERITIES = new Set<WorkerRestartAlertSeverity>(["info", "warning", "critical"]);

function parseDelimitedValues(value: string | undefined): string[] | undefined {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }

  return trimmed
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function parseIsoTimestamp(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }

  const parsed = Date.parse(trimmed);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : undefined;
}

function parseBoundedInteger(value: string | undefined, fallback: number, minimum: number, maximum: number): number {
  const trimmed = value?.trim();
  if (!trimmed) {
    return fallback;
  }

  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(Math.max(parsed, minimum), maximum);
}

function buildDeliveryFilters(query: Record<string, unknown>, defaults: { windowMs: number; limit: number }): WorkerRestartDeliveryJournalFilters {
  const environment = typeof query.environment === "string" ? query.environment.trim() : undefined;
  const destinationName = typeof query.destinationName === "string" ? query.destinationName.trim() : undefined;
  const alertId = typeof query.alertId === "string" ? query.alertId.trim() : undefined;
  const restartRequestId = typeof query.restartRequestId === "string" ? query.restartRequestId.trim() : undefined;
  const formatterProfile = typeof query.formatterProfile === "string" ? query.formatterProfile.trim() : undefined;
  const statuses = parseDelimitedValues(typeof query.status === "string" ? query.status : undefined);
  const rawEventType = query.eventType == null ? undefined : typeof query.eventType === "string" ? query.eventType : null;
  const rawSeverity = query.severity == null ? undefined : typeof query.severity === "string" ? query.severity : null;
  if (rawEventType === null || rawSeverity === null) {
    throw new Error("trend query parameters must be strings");
  }
  const eventTypes = parseDelimitedValues(rawEventType);
  const severities = parseDelimitedValues(rawSeverity);

  if (statuses && statuses.some((status) => !DELIVERY_STATUSES.has(status as WorkerRestartAlertNotificationStatus))) {
    throw new Error("invalid delivery status filter");
  }
  if (eventTypes && eventTypes.some((eventType) => !DELIVERY_EVENT_TYPES.has(eventType as WorkerRestartAlertNotificationEventType))) {
    throw new Error("invalid delivery event type filter");
  }
  if (severities && severities.some((severity) => !DELIVERY_SEVERITIES.has(severity as WorkerRestartAlertSeverity))) {
    throw new Error("invalid delivery severity filter");
  }

  const now = Date.now();
  const toAt = parseIsoTimestamp(typeof query.to === "string" ? query.to : undefined) ?? new Date(now).toISOString();
  const fromAt =
    parseIsoTimestamp(typeof query.from === "string" ? query.from : undefined) ??
    new Date(Date.parse(toAt) - defaults.windowMs).toISOString();

  if (Date.parse(fromAt) > Date.parse(toAt)) {
    throw new Error("delivery window start must be before the end");
  }

  const maxWindowMs = 30 * 24 * 60 * 60 * 1000;
  if (Date.parse(toAt) - Date.parse(fromAt) > maxWindowMs) {
    throw new Error("delivery window is too large");
  }

  return {
    environment: environment || undefined,
    destinationName: destinationName || undefined,
    deliveryStatuses: statuses as WorkerRestartAlertNotificationStatus[] | undefined,
    eventTypes: eventTypes as WorkerRestartAlertNotificationEventType[] | undefined,
    severities: severities as WorkerRestartAlertSeverity[] | undefined,
    alertId: alertId || undefined,
    restartRequestId: restartRequestId || undefined,
    formatterProfile: formatterProfile || undefined,
    windowStartAt: fromAt,
    windowEndAt: toAt,
    limit: parseBoundedInteger(typeof query.limit === "string" ? query.limit : undefined, defaults.limit, 1, 200),
    offset: parseBoundedInteger(typeof query.offset === "string" ? query.offset : undefined, 0, 0, 50_000),
  };
}

function buildTrendFilters(query: Record<string, unknown>): WorkerRestartDeliveryTrendFilters {
  const allowedKeys = new Set([
    "environment",
    "destinationName",
    "eventType",
    "severity",
    "formatterProfile",
    "referenceEndAt",
    "limit",
  ]);
  for (const key of Object.keys(query)) {
    if (!allowedKeys.has(key)) {
      throw new Error(`invalid trend query parameter: ${key}`);
    }
  }

  const environment =
    query.environment == null ? undefined : typeof query.environment === "string" ? query.environment.trim() : null;
  const destinationName =
    query.destinationName == null ? undefined : typeof query.destinationName === "string" ? query.destinationName.trim() : null;
  const formatterProfile =
    query.formatterProfile == null ? undefined : typeof query.formatterProfile === "string" ? query.formatterProfile.trim() : null;
  if (environment === null || destinationName === null || formatterProfile === null) {
    throw new Error("trend query parameters must be strings");
  }
  const eventTypes = parseDelimitedValues(typeof query.eventType === "string" ? query.eventType : undefined);
  const severities = parseDelimitedValues(typeof query.severity === "string" ? query.severity : undefined);

  if (eventTypes && eventTypes.some((eventType) => !DELIVERY_EVENT_TYPES.has(eventType as WorkerRestartAlertNotificationEventType))) {
    throw new Error("invalid trend event type filter");
  }
  if (severities && severities.some((severity) => !DELIVERY_SEVERITIES.has(severity as WorkerRestartAlertSeverity))) {
    throw new Error("invalid trend severity filter");
  }

  const rawReferenceEndAt =
    query.referenceEndAt == null ? undefined : typeof query.referenceEndAt === "string" ? query.referenceEndAt : null;
  if (rawReferenceEndAt === null) {
    throw new Error("trend query parameters must be strings");
  }
  const referenceEndAt = parseIsoTimestamp(rawReferenceEndAt);
  if (rawReferenceEndAt && !referenceEndAt) {
    throw new Error("trend reference end must be a valid ISO timestamp");
  }

  const rawLimit = query.limit == null ? undefined : typeof query.limit === "string" ? query.limit : null;
  if (rawLimit === null) {
    throw new Error("trend query parameters must be strings");
  }
  let limit = 50;
  if (rawLimit) {
    const parsedLimit = Number.parseInt(rawLimit, 10);
    if (!Number.isFinite(parsedLimit) || parsedLimit < 1 || parsedLimit > 100) {
      throw new Error("trend limit must be an integer between 1 and 100");
    }
    limit = parsedLimit;
  }

  return {
    environment: environment || undefined,
    destinationName: destinationName || undefined,
    eventTypes: eventTypes as WorkerRestartAlertNotificationEventType[] | undefined,
    severities: severities as WorkerRestartAlertSeverity[] | undefined,
    formatterProfile: formatterProfile || undefined,
    referenceEndAt: referenceEndAt ?? undefined,
    limit,
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
