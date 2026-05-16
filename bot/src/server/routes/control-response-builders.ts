import { getKillSwitchState } from "../../governance/kill-switch.js";
import { getMicroLiveControlSnapshot } from "../../runtime/live-control.js";
import { buildRuntimeReadiness } from "../runtime-truth.js";
import type { RuntimeConfigStatus } from "../../config/runtime-config-schema.js";
import type { RuntimeConfigMutationResult } from "../../runtime/runtime-config-manager.js";
import type { RuntimeConfigManager } from "../../runtime/runtime-config-manager.js";
import type {
  WorkerRestartSnapshot,
  WorkerRestartStatus,
} from "../../control/worker-restart-service.js";
import type { WorkerRestartAlertSummary } from "../../control/worker-restart-alert-service.js";
import type { WorkerRestartRequestRecord } from "../../persistence/worker-restart-repository.js";
import type { RuntimeReadiness } from "../contracts/kpi.js";
import type { RuntimeSnapshot } from "../../runtime/dry-run-runtime.js";
import type {
  ControlLivePromotionGate,
  ControlLivePromotionRecord,
  ControlLivePromotionTargetMode,
  ControlOperatorAuthContext,
} from "../../control/control-governance.js";
import { buildAuditEventId } from "../../control/control-governance.js";
import type {
  OperatorChecklistStatus,
  OperatorEvidenceChecklistItem,
  OperatorIncidentProcedure,
  OperatorReleaseGateChecklistItem,
  OperatorReleaseGateResponse,
  OperatorReleaseStage,
  RuntimeConfigMutationResponse,
  RuntimeConfigReadResponse,
  RuntimeConfigStatusResponse,
} from "./control.js";

export function buildLivePromotionRecord(input: {
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

export function mergeLivePromotionRecord(
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

export function buildRuntimeConfigReadResponse(manager: RuntimeConfigManager): RuntimeConfigReadResponse {
  return {
    success: true,
    runtimeConfig: manager.getRuntimeConfigStatus(),
    controlView: manager.getRuntimeControlView(),
    document: manager.getRuntimeConfigDocument(),
  };
}

export function buildMutationResponse(
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

export function buildRuntimeConfigStatusResponse(
  snapshot: WorkerRestartSnapshot,
  readiness?: RuntimeReadiness,
  databaseRehearsal?: import("../../control/control-governance.js").ControlRecoveryRehearsalGate,
  databaseRehearsalStatus?: import("../../control/control-governance.js").ControlRecoveryRehearsalOperationalStatus
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

export function toReadiness(runtime?: RuntimeSnapshot): RuntimeReadiness | undefined {
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

function canUseStagedLiveCandidateReleaseGate(
  snapshot: WorkerRestartSnapshot,
  readiness?: RuntimeReadiness
): boolean {
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

function deriveOperatorReleaseStage(
  snapshot: WorkerRestartSnapshot,
  readiness?: RuntimeReadiness
): OperatorReleaseStage {
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
      status: canUseStagedLiveCandidateReleaseGate(snapshot, readiness)
        ? "pass"
        : readiness
          ? "fail"
          : "manual_review_required",
      evidence: ["GET /control/status", "GET /control/release-gate"],
      note: canUseStagedLiveCandidateReleaseGate(snapshot, readiness)
        ? "Staged-live candidate is eligible."
        : "Staged-live candidate remains blocked.",
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
      status: "manual_review_required" satisfies OperatorChecklistStatus,
      evidence: ["GET /health", "GET /control/status"],
      note: "Degraded runtime requires operator review before any live progression.",
    });
  }

  return checklist;
}

export function buildOperatorReleaseGateResponse(
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

export function buildFallbackRestartStatus(
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

export function buildFallbackRestartAlerts(
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
