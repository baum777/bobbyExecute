import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type { RuntimeReadiness } from "../server/contracts/kpi.js";
import type { SchemaMigrationStatus } from "../persistence/schema-migrations.js";
import type { WorkerRestartSnapshot } from "./worker-restart-service.js";

export type ControlOperatorRole = "viewer" | "operator" | "admin";

export type ControlAction =
  | "read_only"
  | "pause"
  | "resume"
  | "acknowledge_restart_alert"
  | "resolve_restart_alert"
  | "emergency_stop"
  | "reset_kill_switch"
  | "restart_worker"
  | "mode_change"
  | "runtime_config_change"
  | "reload"
  | "live_promotion_request"
  | "live_promotion_approve"
  | "live_promotion_deny"
  | "live_promotion_apply"
  | "live_promotion_rollback";

export const CONTROL_OPERATOR_ASSERTION_HEADER = "x-dashboard-operator-assertion";

const ROLE_RANK: Record<ControlOperatorRole, number> = {
  viewer: 0,
  operator: 1,
  admin: 2,
};

const OPERATOR_ACTIONS = new Set<ControlAction>(["pause", "resume", "acknowledge_restart_alert", "resolve_restart_alert"]);
const ADMIN_ONLY_ACTIONS = new Set<ControlAction>([
  "emergency_stop",
  "reset_kill_switch",
  "restart_worker",
  "mode_change",
  "runtime_config_change",
  "reload",
  "live_promotion_request",
  "live_promotion_approve",
  "live_promotion_deny",
  "live_promotion_apply",
  "live_promotion_rollback",
]);

export interface ControlOperatorIdentity {
  actorId: string;
  displayName: string;
  role: ControlOperatorRole;
  sessionId: string;
  issuedAt: string;
  expiresAt: string;
}

export interface ControlOperatorAssertion extends ControlOperatorIdentity {
  version: 1;
  authResult: "authorized" | "denied";
  action: ControlAction;
  target: string;
  requestId?: string;
  reason?: string;
}

export interface ControlOperatorAuthContext {
  identity: ControlOperatorIdentity;
  authResult: "authorized" | "denied";
  action: ControlAction;
  target: string;
  requestId?: string;
  reason?: string;
}

export interface ControlOperatorResolution {
  valid: boolean;
  context: ControlOperatorAuthContext;
  reason?: string;
}

export interface ControlAuditEvent {
  id?: string;
  environment: string;
  action: ControlAction | "auth_failure" | "promotion_request" | "promotion_decision" | "promotion_apply" | "promotion_rollback";
  target: string;
  result: "allowed" | "denied" | "blocked" | "requested" | "approved" | "applied" | "rolled_back";
  actorId: string;
  actorDisplayName: string;
  actorRole: ControlOperatorRole;
  sessionId: string;
  requestId?: string;
  reason?: string;
  note?: string;
  createdAt?: string;
  metadata?: Record<string, unknown>;
}

export type ControlLivePromotionTargetMode = "live_limited" | "live";
export type ControlLivePromotionWorkflowStatus = "pending" | "approved" | "denied" | "blocked" | "applied" | "rolled_back";
export type ControlLivePromotionApplicationStatus = "pending_restart" | "applied" | "rolled_back" | "rejected";
export type ControlRecoveryRehearsalStatus = "passed" | "failed";
export type ControlRecoveryRehearsalContextKind = "canonical" | "staging" | "disposable" | "unknown";
export type ControlRecoveryRehearsalExecutionSource = "manual" | "automated";

export interface ControlRecoveryRehearsalExecutionContext {
  orchestration: "manual_cli" | "render_cron" | "control_path" | "unknown";
  provider?: "render";
  serviceName?: string;
  schedule?: string;
  trigger?: string;
  runId?: string;
}

export interface ControlLivePromotionGateReason {
  code: string;
  message: string;
  severity: "blocked" | "warning";
}

export interface ControlRecoveryRehearsalContext {
  label: string;
  kind: ControlRecoveryRehearsalContextKind;
}

export interface ControlRecoverySnapshotSummary {
  environment: string;
  capturedAt: string;
  schemaState: string;
  counts: Record<string, number>;
  totalRecords: number;
}

export interface ControlRecoveryRehearsalValidation {
  matched: boolean;
  before: ControlRecoverySnapshotSummary;
  after: ControlRecoverySnapshotSummary;
}

export interface ControlRecoveryRehearsalEvidenceRecord {
  id: string;
  environment: string;
  rehearsalKind: "disposable_restore";
  status: ControlRecoveryRehearsalStatus;
  executionSource: ControlRecoveryRehearsalExecutionSource;
  executionContext: ControlRecoveryRehearsalExecutionContext;
  executedAt: string;
  recordedAt: string;
  actorId: string;
  actorDisplayName: string;
  actorRole: ControlOperatorRole;
  sessionId: string;
  sourceContext: ControlRecoveryRehearsalContext;
  targetContext: ControlRecoveryRehearsalContext;
  sourceDatabaseFingerprint: string;
  targetDatabaseFingerprint: string;
  sourceSchemaStatus: SchemaMigrationStatus;
  targetSchemaStatusBefore: SchemaMigrationStatus;
  targetSchemaStatusAfter?: SchemaMigrationStatus;
  restoreValidation: ControlRecoveryRehearsalValidation;
  summary: string;
  failureReason?: string;
}

export interface ControlRecoveryRehearsalGate {
  required: boolean;
  freshnessWindowMs: number;
  status: "fresh" | "stale" | "missing" | "failed";
  ageMs?: number;
  latestEvidence?: ControlRecoveryRehearsalEvidenceRecord | null;
}

export interface ControlLivePromotionGate {
  allowed: boolean;
  targetMode: ControlLivePromotionTargetMode;
  currentMode: string;
  currentRuntimeStatus: string;
  workerHeartbeatAt?: string;
  activeRestartAlertCount: number;
  restartRequired: boolean;
  restartInProgress: boolean;
  killSwitchActive: boolean;
  databaseRehearsal: ControlRecoveryRehearsalGate;
  healthPosture?: string;
  healthReason?: string;
  reasons: ControlLivePromotionGateReason[];
}

export interface ControlLivePromotionRecord {
  id: string;
  environment: string;
  targetMode: ControlLivePromotionTargetMode;
  previousMode: string;
  workflowStatus: ControlLivePromotionWorkflowStatus;
  applicationStatus: ControlLivePromotionApplicationStatus;
  requestReason: string;
  blockedReason?: string;
  approvalReason?: string;
  rollbackReason?: string;
  requestedByActorId: string;
  requestedByDisplayName: string;
  requestedByRole: ControlOperatorRole;
  requestedBySessionId: string;
  requestedAt: string;
  approvedByActorId?: string;
  approvedByDisplayName?: string;
  approvedByRole?: ControlOperatorRole;
  approvedBySessionId?: string;
  approvedAt?: string;
  deniedByActorId?: string;
  deniedByDisplayName?: string;
  deniedByRole?: ControlOperatorRole;
  deniedBySessionId?: string;
  deniedAt?: string;
  appliedByActorId?: string;
  appliedByDisplayName?: string;
  appliedByRole?: ControlOperatorRole;
  appliedBySessionId?: string;
  appliedAt?: string;
  rolledBackByActorId?: string;
  rolledBackByDisplayName?: string;
  rolledBackByRole?: ControlOperatorRole;
  rolledBackBySessionId?: string;
  rolledBackAt?: string;
  gateSnapshot: ControlLivePromotionGate;
  updatedAt: string;
}

export interface ControlGovernanceRepository {
  ensureSchema(): Promise<void>;
  recordAuditEvent(input: ControlAuditEvent): Promise<void>;
  recordDatabaseRehearsalEvidence(input: ControlRecoveryRehearsalEvidenceRecord): Promise<void>;
  loadLatestDatabaseRehearsalEvidence(environment: string): Promise<ControlRecoveryRehearsalEvidenceRecord | null>;
  saveLivePromotionRequest(record: ControlLivePromotionRecord): Promise<void>;
  loadLivePromotionRequest(id: string): Promise<ControlLivePromotionRecord | null>;
  listLivePromotionRequests(environment: string, limit?: number): Promise<ControlLivePromotionRecord[]>;
}

export interface ControlGovernanceRepositoryWithAudits extends ControlGovernanceRepository {
  listAuditEvents(environment: string, limit?: number): Promise<ControlAuditEvent[]>;
}

export interface LivePromotionAuditInput {
  action: ControlAuditEvent["action"];
  target: string;
  result: ControlAuditEvent["result"];
  reason?: string;
  note?: string;
  requestId?: string;
  metadata?: Record<string, unknown>;
}

export interface ControlOperatorAssertionContextInput {
  identity: ControlOperatorIdentity | null;
  action: ControlAction;
  target: string;
  requestId?: string;
  reason?: string;
  authResult: "authorized" | "denied";
}

function trimOrUndefined(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

function base64UrlEncode(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function base64UrlDecode(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}

function signPayload(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function serializeSignedPayload<T extends object>(payload: T, secret: string): string {
  const encoded = base64UrlEncode(JSON.stringify(payload));
  return `${encoded}.${signPayload(encoded, secret)}`;
}

function parseSignedPayload<T extends object>(value: string | undefined, secret: string): T | null {
  const raw = trimOrUndefined(value);
  if (!raw) {
    return null;
  }

  const [payload, signature] = raw.split(".");
  if (!payload || !signature) {
    return null;
  }

  let parsed: T;
  try {
    parsed = JSON.parse(base64UrlDecode(payload)) as T;
  } catch {
    return null;
  }

  const expected = Buffer.from(signPayload(payload, secret), "base64url");
  const actual = Buffer.from(signature, "base64url");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return null;
  }

  return parsed;
}

export function compareControlOperatorRoles(left: ControlOperatorRole, right: ControlOperatorRole): number {
  return ROLE_RANK[left] - ROLE_RANK[right];
}

export function requiredRoleForControlAction(action: ControlAction): ControlOperatorRole | null {
  if (action === "read_only") {
    return null;
  }

  if (OPERATOR_ACTIONS.has(action)) {
    return "operator";
  }

  if (ADMIN_ONLY_ACTIONS.has(action)) {
    return "admin";
  }

  return "admin";
}

export function canRolePerformControlAction(role: ControlOperatorRole | undefined, action: ControlAction): boolean {
  if (!role) {
    return false;
  }

  if (action === "read_only") {
    return true;
  }

  const required = requiredRoleForControlAction(action);
  if (!required) {
    return true;
  }

  return compareControlOperatorRoles(role, required) >= 0;
}

export function classifyControlAction(targetPath: string): { action: ControlAction; target: string } | null {
  if (targetPath === "/emergency-stop" || targetPath === "/control/emergency-stop" || targetPath === "/control/halt") {
    return { action: "emergency_stop", target: targetPath };
  }
  if (targetPath === "/control/reset") {
    return { action: "reset_kill_switch", target: targetPath };
  }
  if (targetPath === "/control/pause") {
    return { action: "pause", target: targetPath };
  }
  if (targetPath === "/control/resume") {
    return { action: "resume", target: targetPath };
  }
  if (targetPath === "/control/restart-worker") {
    return { action: "restart_worker", target: targetPath };
  }
  if (targetPath === "/control/mode") {
    return { action: "mode_change", target: targetPath };
  }
  if (targetPath === "/control/runtime-config") {
    return { action: "runtime_config_change", target: targetPath };
  }
  if (targetPath === "/control/reload") {
    return { action: "reload", target: targetPath };
  }
  if (/^\/control\/restart-alerts\/[^/]+\/acknowledge$/.test(targetPath)) {
    return { action: "acknowledge_restart_alert", target: targetPath };
  }
  if (/^\/control\/restart-alerts\/[^/]+\/resolve$/.test(targetPath)) {
    return { action: "resolve_restart_alert", target: targetPath };
  }
  if (targetPath === "/control/live-promotion/request") {
    return { action: "live_promotion_request", target: targetPath };
  }
  if (/^\/control\/live-promotion\/[^/]+\/approve$/.test(targetPath)) {
    return { action: "live_promotion_approve", target: targetPath };
  }
  if (/^\/control\/live-promotion\/[^/]+\/deny$/.test(targetPath)) {
    return { action: "live_promotion_deny", target: targetPath };
  }
  if (/^\/control\/live-promotion\/[^/]+\/apply$/.test(targetPath)) {
    return { action: "live_promotion_apply", target: targetPath };
  }
  if (/^\/control\/live-promotion\/[^/]+\/rollback$/.test(targetPath)) {
    return { action: "live_promotion_rollback", target: targetPath };
  }
  return null;
}

export function buildControlOperatorAssertion(
  input: ControlOperatorAssertionContextInput
): ControlOperatorAssertion {
  const identity = input.identity ?? {
    actorId: "anonymous",
    displayName: "anonymous",
    role: "viewer",
    sessionId: "anonymous",
    issuedAt: new Date().toISOString(),
    expiresAt: new Date().toISOString(),
  };

  return {
    version: 1,
    actorId: identity.actorId,
    displayName: identity.displayName,
    role: identity.role,
    sessionId: identity.sessionId,
    issuedAt: identity.issuedAt,
    expiresAt: identity.expiresAt,
    authResult: input.authResult,
    action: input.action,
    target: input.target,
    requestId: input.requestId,
    reason: input.reason,
  };
}

export function serializeControlOperatorAssertion(
  input: ControlOperatorAssertionContextInput,
  secret: string
): string {
  return serializeSignedPayload(buildControlOperatorAssertion(input), secret);
}

export function parseControlOperatorAssertion(
  value: string | undefined,
  secret: string
): ControlOperatorAssertion | null {
  return parseSignedPayload<ControlOperatorAssertion>(value, secret);
}

const LIVE_PROMOTION_HEARTBEAT_MAX_AGE_MS = 5 * 60 * 1000;
const DATABASE_REHEARSAL_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function isHeartbeatFresh(heartbeatAt?: string): boolean {
  if (!heartbeatAt) {
    return false;
  }

  const heartbeatMs = Date.parse(heartbeatAt);
  return Number.isFinite(heartbeatMs) && Date.now() - heartbeatMs <= LIVE_PROMOTION_HEARTBEAT_MAX_AGE_MS;
}

function addBlockedReason(
  reasons: ControlLivePromotionGateReason[],
  code: string,
  message: string,
  severity: "blocked" | "warning" = "blocked"
): void {
  reasons.push({ code, message, severity });
}

export function evaluateDatabaseRehearsalGate(
  latestEvidence: ControlRecoveryRehearsalEvidenceRecord | null | undefined,
  options: {
    targetMode: ControlLivePromotionTargetMode;
    freshnessWindowMs?: number;
    nowMs?: number;
  }
): ControlRecoveryRehearsalGate {
  const freshnessWindowMs = options.freshnessWindowMs ?? DATABASE_REHEARSAL_MAX_AGE_MS;
  const nowMs = options.nowMs ?? Date.now();
  const required = options.targetMode === "live_limited" || options.targetMode === "live";

  if (!required) {
    return {
      required: false,
      freshnessWindowMs,
      status: "fresh",
      latestEvidence: latestEvidence ?? null,
    };
  }

  if (!latestEvidence) {
    return {
      required: true,
      freshnessWindowMs,
      status: "missing",
      latestEvidence: null,
    };
  }

  if (latestEvidence.status === "failed") {
    return {
      required: true,
      freshnessWindowMs,
      status: "failed",
      latestEvidence,
    };
  }

  const executedAtMs = Date.parse(latestEvidence.executedAt);
  if (!Number.isFinite(executedAtMs)) {
    return {
      required: true,
      freshnessWindowMs,
      status: "failed",
      latestEvidence,
    };
  }

  const ageMs = Math.max(0, nowMs - executedAtMs);
  if (ageMs > freshnessWindowMs) {
    return {
      required: true,
      freshnessWindowMs,
      status: "stale",
      ageMs,
      latestEvidence,
    };
  }

  return {
    required: true,
    freshnessWindowMs,
    status: "fresh",
    ageMs,
    latestEvidence,
  };
}

export function evaluateLivePromotionGate(
  snapshot: WorkerRestartSnapshot,
  readiness: RuntimeReadiness | undefined,
  targetMode: ControlLivePromotionTargetMode,
  options: {
    latestDatabaseRehearsal?: ControlRecoveryRehearsalEvidenceRecord | null;
    databaseRehearsalFreshnessWindowMs?: number;
    nowMs?: number;
  } = {}
): ControlLivePromotionGate {
  const reasons: ControlLivePromotionGateReason[] = [];
  const currentMode = snapshot.runtimeConfig.appliedMode ?? snapshot.runtimeConfig.requestedMode ?? "unknown";
  const currentRuntimeStatus = snapshot.runtime?.status ?? "unknown";
  const workerHeartbeatAt = snapshot.worker?.lastHeartbeatAt;
  const activeRestartAlertCount = snapshot.restartAlerts.activeAlertCount ?? 0;
  const restartRequired = Boolean(snapshot.restart?.required || snapshot.runtimeConfig.requiresRestart || snapshot.runtimeConfig.pendingApply);
  const restartInProgress = Boolean(snapshot.restart?.inProgress);
  const killSwitchActive = Boolean(snapshot.runtimeConfig.killSwitch || snapshot.controlView.killSwitch);
  const healthPosture = readiness?.posture;
  const healthReason = readiness?.reason;
  const databaseRehearsal = evaluateDatabaseRehearsalGate(options.latestDatabaseRehearsal, {
    targetMode,
    freshnessWindowMs: options.databaseRehearsalFreshnessWindowMs,
    nowMs: options.nowMs,
  });

  if (currentRuntimeStatus === "error") {
    addBlockedReason(reasons, "runtime_error", "Runtime is in error state and requires manual review.");
  }

  if (!isHeartbeatFresh(workerHeartbeatAt)) {
    addBlockedReason(reasons, "stale_worker_heartbeat", "Worker heartbeat is stale or missing.");
  }

  if (activeRestartAlertCount > 0) {
    addBlockedReason(reasons, "active_restart_alerts", "One or more restart alerts remain unresolved.");
  }

  if (restartRequired) {
    addBlockedReason(reasons, "pending_restart_required", "Restart-required config remains unresolved.");
  }

  if (restartInProgress) {
    addBlockedReason(reasons, "restart_in_progress", "Worker restart is already in progress.");
  }

  if (killSwitchActive) {
    addBlockedReason(reasons, "kill_switch_active", "Kill switch is active.");
  }

  if (databaseRehearsal.required) {
    if (databaseRehearsal.status === "missing") {
      addBlockedReason(reasons, "database_rehearsal_missing", "No successful disposable restore rehearsal is recorded.");
    } else if (databaseRehearsal.status === "failed") {
      addBlockedReason(reasons, "database_rehearsal_failed", "The most recent database rehearsal failed and promotion remains blocked.");
    } else if (databaseRehearsal.status === "stale") {
      addBlockedReason(
        reasons,
        "database_rehearsal_stale",
        `The most recent successful database rehearsal is older than ${Math.floor(databaseRehearsal.freshnessWindowMs / (24 * 60 * 60 * 1000))} days.`
      );
    }
  }

  if (targetMode === "live_limited") {
    if (healthPosture === "manual_review_required") {
      addBlockedReason(reasons, "manual_review_required", healthReason ?? "Runtime requires manual review.");
    }
    if (readiness?.rolloutConfigValid === false) {
      addBlockedReason(reasons, "rollout_config_invalid", "Rollout posture configuration is invalid.");
    }
  }

  if (targetMode === "live") {
    if (!readiness?.liveAllowed) {
      addBlockedReason(reasons, "live_not_allowed", readiness?.reason ?? "Live operation is not currently allowed.");
    }
    if (healthPosture !== "healthy_for_posture") {
      addBlockedReason(reasons, "live_health_not_healthy", healthReason ?? "Runtime health is not healthy enough for live promotion.");
    }
  }

  return {
    allowed: reasons.length === 0,
    targetMode,
    currentMode,
    currentRuntimeStatus,
    workerHeartbeatAt,
    activeRestartAlertCount,
    restartRequired,
    restartInProgress,
    killSwitchActive,
    databaseRehearsal,
    healthPosture,
    healthReason,
    reasons,
  };
}

export function buildControlAuditActor(identity: ControlOperatorIdentity | null | undefined): {
  actorId: string;
  actorDisplayName: string;
  actorRole: ControlOperatorRole;
  sessionId: string;
} {
  return {
    actorId: identity?.actorId ?? "anonymous",
    actorDisplayName: identity?.displayName ?? "anonymous",
    actorRole: identity?.role ?? "viewer",
    sessionId: identity?.sessionId ?? "anonymous",
  };
}

export function buildAuditEventId(): string {
  return randomUUID();
}
