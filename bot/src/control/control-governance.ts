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

export type ControlRecoveryRehearsalFreshnessStatus = "healthy" | "warning" | "stale" | "failed" | "unknown";
export type ControlRecoveryRehearsalAlertReasonCode =
  | "rehearsal_missing"
  | "rehearsal_fresh"
  | "rehearsal_warning_threshold"
  | "rehearsal_stale"
  | "rehearsal_failed"
  | "automated_rehearsal_missing"
  | "automated_rehearsal_repeated_failure";
export type ControlRecoveryRehearsalAlertSeverity = "warning" | "critical";
export type ControlRecoveryRehearsalAlertStatus = "open" | "acknowledged" | "resolved";
export type ControlRecoveryRehearsalAlertEventAction =
  | "opened"
  | "updated"
  | "reopened"
  | "acknowledged"
  | "resolved";
export type ControlRecoveryRehearsalAutomationHealth = "healthy" | "degraded" | "unhealthy" | "unknown";
export type ControlRecoveryRehearsalNotificationEventType =
  | "freshness_stale_opened"
  | "freshness_failed_opened"
  | "freshness_repeated_failure"
  | "freshness_recovered";
export type ControlRecoveryRehearsalNotificationStatus = "pending" | "sent" | "skipped" | "suppressed" | "failed";

export interface ControlRecoveryRehearsalNotificationDestinationSummary {
  name: string;
  sinkType?: string;
  formatterProfile?: string;
  priority?: number;
  selected: boolean;
  latestDeliveryStatus?: ControlRecoveryRehearsalNotificationStatus;
  attemptCount: number;
  lastAttemptedAt?: string;
  lastFailureReason?: string;
  suppressionReason?: string;
  routeReason?: string;
  dedupeKey?: string;
  payloadFingerprint?: string;
  recoveryNotificationSent?: boolean;
  recoveryNotificationAt?: string;
}

export interface ControlRecoveryRehearsalNotificationSummary {
  externallyNotified: boolean;
  sinkName?: string;
  sinkType?: string;
  latestDestinationName?: string;
  latestDestinationType?: string;
  latestFormatterProfile?: string;
  eventType?: ControlRecoveryRehearsalNotificationEventType;
  latestDeliveryStatus?: ControlRecoveryRehearsalNotificationStatus;
  attemptCount: number;
  lastAttemptedAt?: string;
  lastFailureReason?: string;
  suppressionReason?: string;
  dedupeKey?: string;
  payloadFingerprint?: string;
  recoveryNotificationSent?: boolean;
  recoveryNotificationAt?: string;
  selectedDestinationCount: number;
  selectedDestinationNames: string[];
  destinations: ControlRecoveryRehearsalNotificationDestinationSummary[];
}

export interface ControlRecoveryRehearsalAlertRecord {
  id: string;
  environment: string;
  reasonCode: ControlRecoveryRehearsalAlertReasonCode;
  severity: ControlRecoveryRehearsalAlertSeverity;
  status: ControlRecoveryRehearsalAlertStatus;
  summary: string;
  recommendedAction: string;
  freshnessStatus: ControlRecoveryRehearsalFreshnessStatus;
  blockedByFreshness: boolean;
  freshnessWindowMs: number;
  warningThresholdMs: number;
  freshnessAgeMs?: number;
  lastSuccessfulRehearsalAt?: string;
  lastFailedRehearsalAt?: string;
  latestEvidenceId?: string;
  latestEvidenceExecutedAt?: string;
  latestEvidenceStatus?: ControlRecoveryRehearsalStatus | "unknown";
  latestEvidenceExecutionSource?: ControlRecoveryRehearsalExecutionSource | "unknown";
  latestAutomatedRunAt?: string;
  latestAutomatedRunStatus?: ControlRecoveryRehearsalStatus | "unknown";
  latestManualRunAt?: string;
  latestManualRunStatus?: ControlRecoveryRehearsalStatus | "unknown";
  repeatedAutomationFailureCount: number;
  automationHealth: ControlRecoveryRehearsalAutomationHealth;
  manualFallbackActive: boolean;
  notification?: ControlRecoveryRehearsalNotificationSummary;
  firstSeenAt: string;
  lastSeenAt: string;
  lastEvaluatedAt: string;
  acknowledgedAt?: string;
  acknowledgedBy?: string;
  acknowledgmentNote?: string;
  resolvedAt?: string;
  resolvedBy?: string;
  resolutionNote?: string;
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
}

export interface ControlRecoveryRehearsalAlertEventRecord {
  id: string;
  environment: string;
  alertId: string;
  action: ControlRecoveryRehearsalAlertEventAction;
  accepted: boolean;
  beforeStatus?: ControlRecoveryRehearsalAlertStatus;
  afterStatus?: ControlRecoveryRehearsalAlertStatus;
  reasonCode?: ControlRecoveryRehearsalAlertReasonCode;
  summary?: string;
  note?: string;
  metadata?: Record<string, unknown>;
  notificationEventType?: ControlRecoveryRehearsalNotificationEventType;
  notificationStatus?: ControlRecoveryRehearsalNotificationStatus;
  notificationSinkName?: string;
  notificationSinkType?: string;
  notificationDestinationName?: string;
  notificationDestinationType?: string;
  notificationFormatterProfile?: string;
  notificationDestinationPriority?: number;
  notificationDestinationTags?: string[];
  notificationDedupeKey?: string;
  notificationPayloadFingerprint?: string;
  notificationAttemptCount?: number;
  notificationFailureReason?: string;
  notificationSuppressionReason?: string;
  notificationRouteReason?: string;
  notificationResponseStatus?: number;
  notificationResponseBody?: string;
  notificationScope?: "internal" | "external";
  createdAt: string;
}

export interface ControlRecoveryRehearsalOperationalStatus {
  environment: string;
  freshnessStatus: ControlRecoveryRehearsalFreshnessStatus;
  blockedByFreshness: boolean;
  freshnessWindowMs: number;
  warningThresholdMs: number;
  freshnessAgeMs?: number;
  lastSuccessfulRehearsalAt?: string;
  lastFailedRehearsalAt?: string;
  latestEvidence?: ControlRecoveryRehearsalEvidenceRecord | null;
  latestEvidenceExecutionSource?: ControlRecoveryRehearsalExecutionSource | "unknown";
  latestEvidenceStatus?: ControlRecoveryRehearsalStatus | "unknown";
  latestAutomatedRunAt?: string;
  latestAutomatedRunStatus?: ControlRecoveryRehearsalStatus | "unknown";
  latestManualRunAt?: string;
  latestManualRunStatus?: ControlRecoveryRehearsalStatus | "unknown";
  repeatedAutomationFailureCount: number;
  automationHealth: ControlRecoveryRehearsalAutomationHealth;
  manualFallbackActive: boolean;
  notification?: ControlRecoveryRehearsalNotificationSummary;
  reasonCode: ControlRecoveryRehearsalAlertReasonCode;
  severity: ControlRecoveryRehearsalAlertSeverity;
  statusMessage: string;
  alert: ControlRecoveryRehearsalAlertRecord | null;
  hasOpenAlert: boolean;
  lastEvaluatedAt: string;
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
  listDatabaseRehearsalEvidence(environment: string, limit?: number): Promise<ControlRecoveryRehearsalEvidenceRecord[]>;
  loadDatabaseRehearsalFreshnessAlert(environment: string): Promise<ControlRecoveryRehearsalAlertRecord | null>;
  saveDatabaseRehearsalFreshnessAlert(record: ControlRecoveryRehearsalAlertRecord): Promise<void>;
  recordDatabaseRehearsalFreshnessAlertEvent(event: ControlRecoveryRehearsalAlertEventRecord): Promise<void>;
  listDatabaseRehearsalFreshnessAlertEvents(
    environment: string,
    limit?: number
  ): Promise<ControlRecoveryRehearsalAlertEventRecord[]>;
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
export const DATABASE_REHEARSAL_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
export const DATABASE_REHEARSAL_WARNING_RATIO = 0.8;
export const DATABASE_REHEARSAL_REPEATED_AUTOMATION_FAILURE_THRESHOLD = 2;

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

function rehearsalStatusLabel(status: ControlRecoveryRehearsalStatus | "unknown" | undefined): string {
  return status ?? "unknown";
}

function pickLatestEvidence(
  evidence: ControlRecoveryRehearsalEvidenceRecord[],
  source?: ControlRecoveryRehearsalExecutionSource
): ControlRecoveryRehearsalEvidenceRecord | undefined {
  return evidence.find((entry) => !source || entry.executionSource === source);
}

function countRepeatedAutomatedFailures(evidence: ControlRecoveryRehearsalEvidenceRecord[]): number {
  let count = 0;
  for (const entry of evidence) {
    if (entry.executionSource !== "automated") {
      continue;
    }

    if (entry.status === "passed") {
      break;
    }

    count += 1;
  }
  return count;
}

function buildDatabaseRehearsalAlertContent(input: {
  environment: string;
  freshnessStatus: ControlRecoveryRehearsalFreshnessStatus;
  blockedByFreshness: boolean;
  freshnessWindowMs: number;
  warningThresholdMs: number;
  freshnessAgeMs?: number;
  lastSuccessfulRehearsalAt?: string;
  lastFailedRehearsalAt?: string;
  latestEvidence?: ControlRecoveryRehearsalEvidenceRecord | null;
  latestAutomatedRunAt?: string;
  latestAutomatedRunStatus?: ControlRecoveryRehearsalStatus | "unknown";
  latestManualRunAt?: string;
  latestManualRunStatus?: ControlRecoveryRehearsalStatus | "unknown";
  repeatedAutomationFailureCount: number;
  automationHealth: ControlRecoveryRehearsalAutomationHealth;
  manualFallbackActive: boolean;
  lastEvaluatedAt?: string;
}): Omit<ControlRecoveryRehearsalAlertRecord, "id" | "status" | "firstSeenAt" | "lastSeenAt" | "createdAt" | "updatedAt"> {
  const reasonCode = (() => {
    switch (input.freshnessStatus) {
      case "unknown":
        return "rehearsal_missing";
      case "warning":
        return input.manualFallbackActive ? "automated_rehearsal_missing" : "rehearsal_warning_threshold";
      case "stale":
        return "rehearsal_stale";
      case "failed":
        return input.repeatedAutomationFailureCount >= DATABASE_REHEARSAL_REPEATED_AUTOMATION_FAILURE_THRESHOLD
          ? "automated_rehearsal_repeated_failure"
          : "rehearsal_failed";
      case "healthy":
      default:
        return input.manualFallbackActive ? "automated_rehearsal_missing" : "rehearsal_fresh";
    }
  })();

  const severity: ControlRecoveryRehearsalAlertSeverity =
    input.freshnessStatus === "healthy" || input.freshnessStatus === "warning" ? "warning" : "critical";

  const summary = (() => {
    switch (reasonCode) {
      case "rehearsal_missing":
        return "No database rehearsal evidence is recorded.";
      case "rehearsal_fresh":
        return "The latest successful rehearsal is fresh.";
      case "rehearsal_warning_threshold":
        return "Latest successful rehearsal is approaching the freshness window.";
      case "rehearsal_stale":
        return "Latest successful rehearsal is older than the freshness window.";
      case "rehearsal_failed":
        return "The latest database rehearsal run failed.";
      case "automated_rehearsal_missing":
        return "Fresh evidence is present, but the latest success came from manual fallback and automated cadence has not recovered.";
      case "automated_rehearsal_repeated_failure":
        return "Repeated automated rehearsal failures are preventing the automation cadence from recovering.";
      default:
        return "Database rehearsal freshness requires operator attention.";
    }
  })();

  const recommendedAction = (() => {
    switch (reasonCode) {
      case "rehearsal_missing":
        return "Run the Render rehearsal refresh or a manual rehearsal before promotion.";
      case "rehearsal_fresh":
        return "No action needed; keep the automatic rehearsal cadence healthy.";
      case "rehearsal_warning_threshold":
        return "Wait for the next scheduled rehearsal refresh and verify the new evidence row.";
      case "rehearsal_stale":
        return "Do not promote until a fresh rehearsal completes successfully.";
      case "rehearsal_failed":
        return "Fix the disposable rehearsal path and rerun the rehearsal flow.";
      case "automated_rehearsal_missing":
        return "Investigate the Render cron path and confirm automated rehearsal refresh has recovered.";
      case "automated_rehearsal_repeated_failure":
        return "Inspect source and disposable target DB configuration before retrying automation.";
      default:
        return "Review rehearsal freshness before promotion.";
    }
  })();

  return {
    environment: input.environment,
    reasonCode,
    severity,
    summary,
    recommendedAction,
    freshnessStatus: input.freshnessStatus,
    blockedByFreshness: input.blockedByFreshness,
    freshnessWindowMs: input.freshnessWindowMs,
    warningThresholdMs: input.warningThresholdMs,
    freshnessAgeMs: input.freshnessAgeMs,
    lastSuccessfulRehearsalAt: input.lastSuccessfulRehearsalAt,
    lastFailedRehearsalAt: input.lastFailedRehearsalAt,
    latestEvidenceId: input.latestEvidence?.id,
    latestEvidenceExecutedAt: input.latestEvidence?.executedAt,
    latestEvidenceStatus: input.latestEvidence?.status,
    latestEvidenceExecutionSource: input.latestEvidence?.executionSource,
    latestAutomatedRunAt: input.latestAutomatedRunAt,
    latestAutomatedRunStatus: input.latestAutomatedRunStatus,
    latestManualRunAt: input.latestManualRunAt,
    latestManualRunStatus: input.latestManualRunStatus,
    repeatedAutomationFailureCount: input.repeatedAutomationFailureCount,
    automationHealth: input.automationHealth,
    manualFallbackActive: input.manualFallbackActive,
    lastEvaluatedAt: input.lastEvaluatedAt ?? new Date().toISOString(),
    metadata: {
      freshnessStatus: input.freshnessStatus,
      blockedByFreshness: input.blockedByFreshness,
    },
  };
}

function buildDatabaseRehearsalAlertId(environment: string): string {
  return `database-rehearsal-freshness:${environment}`;
}

export function buildDatabaseRehearsalFreshnessStatus(
  evidenceHistory: ControlRecoveryRehearsalEvidenceRecord[],
  options: {
    environment?: string;
    freshnessWindowMs?: number;
    nowMs?: number;
  } = {}
): ControlRecoveryRehearsalOperationalStatus {
  const freshnessWindowMs = options.freshnessWindowMs ?? DATABASE_REHEARSAL_MAX_AGE_MS;
  const warningThresholdMs = Math.floor(freshnessWindowMs * DATABASE_REHEARSAL_WARNING_RATIO);
  const nowMs = options.nowMs ?? Date.now();
  const environment = options.environment ?? "unknown";
  const sorted = [...evidenceHistory].sort((left, right) => Date.parse(right.executedAt) - Date.parse(left.executedAt));
  const latestEvidence = sorted[0] ?? null;
  const latestSuccessfulEvidence = sorted.find((entry) => entry.status === "passed") ?? null;
  const latestFailedEvidence = sorted.find((entry) => entry.status === "failed") ?? null;
  const latestAutomatedEvidence = pickLatestEvidence(sorted, "automated") ?? null;
  const latestManualEvidence = pickLatestEvidence(sorted, "manual") ?? null;
  const repeatedAutomationFailureCount = countRepeatedAutomatedFailures(sorted);

  const freshnessAgeMs = latestSuccessfulEvidence ? Math.max(0, nowMs - Date.parse(latestSuccessfulEvidence.executedAt)) : undefined;
  const latestEvidenceExecutionSource = latestEvidence?.executionSource ?? "unknown";
  const latestEvidenceStatus = latestEvidence?.status ?? "unknown";
  const latestAutomatedRunStatus = latestAutomatedEvidence?.status ?? "unknown";
  const latestManualRunStatus = latestManualEvidence?.status ?? "unknown";
  const latestAutomatedRunAt = latestAutomatedEvidence?.executedAt;
  const latestManualRunAt = latestManualEvidence?.executedAt;
  const lastSuccessfulRehearsalAt = latestSuccessfulEvidence?.executedAt;
  const lastFailedRehearsalAt = latestFailedEvidence?.executedAt;
  const manualFallbackActive = Boolean(latestSuccessfulEvidence && latestSuccessfulEvidence.executionSource === "manual");

  let freshnessStatus: ControlRecoveryRehearsalFreshnessStatus = "unknown";
  let blockedByFreshness = true;
  let reasonCode: ControlRecoveryRehearsalAlertReasonCode = "rehearsal_missing";
  let severity: ControlRecoveryRehearsalAlertSeverity = "critical";
  let statusMessage = "No database rehearsal evidence is recorded.";
  let automationHealth: ControlRecoveryRehearsalAutomationHealth = "unknown";

  if (!latestEvidence) {
    freshnessStatus = "unknown";
  } else if (latestEvidenceStatus === "failed") {
    freshnessStatus = "failed";
    reasonCode =
      repeatedAutomationFailureCount >= DATABASE_REHEARSAL_REPEATED_AUTOMATION_FAILURE_THRESHOLD
        ? "automated_rehearsal_repeated_failure"
        : "rehearsal_failed";
    severity = "critical";
    automationHealth =
      repeatedAutomationFailureCount >= DATABASE_REHEARSAL_REPEATED_AUTOMATION_FAILURE_THRESHOLD
        ? "unhealthy"
        : "degraded";
    statusMessage =
      reasonCode === "automated_rehearsal_repeated_failure"
        ? "Repeated automated rehearsal failures are preventing refresh recovery."
        : "The latest database rehearsal run failed.";
  } else if (!latestSuccessfulEvidence) {
    freshnessStatus = "failed";
    reasonCode = repeatedAutomationFailureCount >= DATABASE_REHEARSAL_REPEATED_AUTOMATION_FAILURE_THRESHOLD
      ? "automated_rehearsal_repeated_failure"
      : "rehearsal_failed";
    severity = "critical";
    automationHealth =
      repeatedAutomationFailureCount >= DATABASE_REHEARSAL_REPEATED_AUTOMATION_FAILURE_THRESHOLD
        ? "unhealthy"
        : "degraded";
    statusMessage = "No successful rehearsal evidence is available.";
  } else if (!Number.isFinite(Date.parse(latestSuccessfulEvidence.executedAt))) {
    freshnessStatus = "failed";
    reasonCode = "rehearsal_failed";
    severity = "critical";
    automationHealth = "unhealthy";
    statusMessage = "The latest successful rehearsal timestamp is invalid.";
  } else {
    const ageMs = freshnessAgeMs ?? 0;
    if (ageMs > freshnessWindowMs) {
      freshnessStatus = "stale";
      blockedByFreshness = true;
      reasonCode = "rehearsal_stale";
      severity = "critical";
      statusMessage = "The latest successful rehearsal is older than the freshness window.";
    } else if (manualFallbackActive) {
      freshnessStatus = "warning";
      blockedByFreshness = false;
      reasonCode =
        repeatedAutomationFailureCount >= DATABASE_REHEARSAL_REPEATED_AUTOMATION_FAILURE_THRESHOLD
          ? "automated_rehearsal_repeated_failure"
          : "automated_rehearsal_missing";
      severity = "warning";
      statusMessage = "Fresh evidence is present, but the latest success came from manual fallback.";
    } else if (ageMs > warningThresholdMs) {
      freshnessStatus = "warning";
      blockedByFreshness = false;
      reasonCode = "rehearsal_warning_threshold";
      severity = "warning";
      statusMessage = "The latest successful rehearsal is nearing the freshness expiry window.";
    } else {
      freshnessStatus = "healthy";
      blockedByFreshness = false;
      reasonCode = "rehearsal_fresh";
      severity = "warning";
      statusMessage = "The latest successful rehearsal is fresh.";
    }

    automationHealth =
      repeatedAutomationFailureCount >= DATABASE_REHEARSAL_REPEATED_AUTOMATION_FAILURE_THRESHOLD
        ? "unhealthy"
        : manualFallbackActive
          ? "degraded"
          : latestAutomatedRunStatus === "failed" || latestAutomatedRunStatus === "unknown"
            ? "degraded"
            : freshnessStatus === "healthy"
              ? "healthy"
              : freshnessStatus === "warning"
                ? "degraded"
                : "unhealthy";
  }

  const alert = buildDatabaseRehearsalAlertContent({
    environment,
    freshnessStatus,
    blockedByFreshness,
    freshnessWindowMs,
    warningThresholdMs,
    freshnessAgeMs,
    lastSuccessfulRehearsalAt,
    lastFailedRehearsalAt,
    latestEvidence,
    latestAutomatedRunAt,
    latestAutomatedRunStatus,
    latestManualRunAt,
    latestManualRunStatus,
    repeatedAutomationFailureCount,
    automationHealth,
    manualFallbackActive,
    lastEvaluatedAt: new Date(nowMs).toISOString(),
  });

  return {
    environment,
    freshnessStatus,
    blockedByFreshness,
    freshnessWindowMs,
    warningThresholdMs,
    freshnessAgeMs,
    lastSuccessfulRehearsalAt,
    lastFailedRehearsalAt,
    latestEvidence,
    latestEvidenceExecutionSource,
    latestEvidenceStatus,
    latestAutomatedRunAt,
    latestAutomatedRunStatus,
    latestManualRunAt,
    latestManualRunStatus,
    repeatedAutomationFailureCount,
    automationHealth,
    manualFallbackActive,
    reasonCode,
    severity,
    statusMessage,
    alert: {
      ...alert,
      id: buildDatabaseRehearsalAlertId(environment),
      status: freshnessStatus === "healthy" ? "resolved" : "open",
      firstSeenAt: new Date(nowMs).toISOString(),
      lastSeenAt: new Date(nowMs).toISOString(),
      lastEvaluatedAt: new Date(nowMs).toISOString(),
      createdAt: new Date(nowMs).toISOString(),
      updatedAt: new Date(nowMs).toISOString(),
    },
    hasOpenAlert: freshnessStatus !== "healthy",
    lastEvaluatedAt: new Date(nowMs).toISOString(),
  };
}

function alertEventActionForTransition(
  before: ControlRecoveryRehearsalAlertRecord | null,
  after: ControlRecoveryRehearsalAlertRecord
): ControlRecoveryRehearsalAlertEventAction {
  if (!before) {
    return after.status === "resolved" ? "updated" : "opened";
  }
  if (before.status === "resolved" && after.status !== "resolved") {
    return "reopened";
  }
  if (before.status !== after.status) {
    if (after.status === "resolved") {
      return "resolved";
    }
    if (after.status === "acknowledged") {
      return "acknowledged";
    }
    return "updated";
  }
  return "updated";
}

function prepareDatabaseRehearsalAlertRecord(
  environment: string,
  current: ControlRecoveryRehearsalOperationalStatus,
  previous?: ControlRecoveryRehearsalAlertRecord | null,
  nowIso = new Date().toISOString()
): ControlRecoveryRehearsalAlertRecord {
  const base = current.alert ?? (() => {
    throw new Error("Database rehearsal freshness alert payload is missing.");
  })();
  const priorCreatedAt = previous?.createdAt ?? nowIso;
  const priorFirstSeenAt = previous?.firstSeenAt ?? priorCreatedAt;
  const status = current.hasOpenAlert ? (previous?.status === "acknowledged" ? "acknowledged" : "open") : "resolved";
  return {
    id: buildDatabaseRehearsalAlertId(environment),
    environment,
    reasonCode: current.reasonCode,
    severity: current.severity,
    status,
    summary: base.summary,
    recommendedAction: base.recommendedAction,
    freshnessStatus: current.freshnessStatus,
    blockedByFreshness: current.blockedByFreshness,
    freshnessWindowMs: current.freshnessWindowMs,
    warningThresholdMs: current.warningThresholdMs,
    freshnessAgeMs: current.freshnessAgeMs,
    lastSuccessfulRehearsalAt: current.lastSuccessfulRehearsalAt,
    lastFailedRehearsalAt: current.lastFailedRehearsalAt,
    latestEvidenceId: base.latestEvidenceId,
    latestEvidenceExecutedAt: base.latestEvidenceExecutedAt,
    latestEvidenceStatus: base.latestEvidenceStatus,
    latestEvidenceExecutionSource: base.latestEvidenceExecutionSource,
    latestAutomatedRunAt: current.latestAutomatedRunAt,
    latestAutomatedRunStatus: current.latestAutomatedRunStatus,
    latestManualRunAt: current.latestManualRunAt,
    latestManualRunStatus: current.latestManualRunStatus,
    repeatedAutomationFailureCount: current.repeatedAutomationFailureCount,
    automationHealth: current.automationHealth,
    manualFallbackActive: current.manualFallbackActive,
    notification: previous?.notification ?? current.alert?.notification,
    firstSeenAt: priorFirstSeenAt,
    lastSeenAt: nowIso,
    lastEvaluatedAt: nowIso,
    acknowledgedAt: previous?.acknowledgedAt,
    acknowledgedBy: previous?.acknowledgedBy,
    acknowledgmentNote: previous?.acknowledgmentNote,
    resolvedAt: current.hasOpenAlert ? previous?.resolvedAt : nowIso,
    resolvedBy: current.hasOpenAlert ? previous?.resolvedBy : "system",
    resolutionNote: current.hasOpenAlert ? previous?.resolutionNote : "fresh rehearsal evidence restored",
    createdAt: previous?.createdAt ?? nowIso,
    updatedAt: nowIso,
    metadata: base.metadata,
  };
}

function compareFreshnessAlertMaterialState(record: ControlRecoveryRehearsalAlertRecord): string {
  return JSON.stringify({
    reasonCode: record.reasonCode,
    severity: record.severity,
    status: record.status,
    summary: record.summary,
    recommendedAction: record.recommendedAction,
    freshnessStatus: record.freshnessStatus,
    blockedByFreshness: record.blockedByFreshness,
    freshnessWindowMs: record.freshnessWindowMs,
    warningThresholdMs: record.warningThresholdMs,
    lastSuccessfulRehearsalAt: record.lastSuccessfulRehearsalAt ?? null,
    lastFailedRehearsalAt: record.lastFailedRehearsalAt ?? null,
    latestEvidenceId: record.latestEvidenceId ?? null,
    latestEvidenceExecutedAt: record.latestEvidenceExecutedAt ?? null,
    latestEvidenceStatus: record.latestEvidenceStatus ?? null,
    latestEvidenceExecutionSource: record.latestEvidenceExecutionSource ?? null,
    latestAutomatedRunAt: record.latestAutomatedRunAt ?? null,
    latestAutomatedRunStatus: record.latestAutomatedRunStatus ?? null,
    latestManualRunAt: record.latestManualRunAt ?? null,
    latestManualRunStatus: record.latestManualRunStatus ?? null,
    repeatedAutomationFailureCount: record.repeatedAutomationFailureCount,
    automationHealth: record.automationHealth,
    manualFallbackActive: record.manualFallbackActive,
    acknowledgedAt: record.acknowledgedAt ?? null,
    acknowledgedBy: record.acknowledgedBy ?? null,
    acknowledgmentNote: record.acknowledgmentNote ?? null,
    resolvedAt: record.resolvedAt ?? null,
    resolvedBy: record.resolvedBy ?? null,
    resolutionNote: record.resolutionNote ?? null,
  });
}

function shouldPersistFreshnessAlert(
  previous: ControlRecoveryRehearsalAlertRecord | null | undefined,
  next: ControlRecoveryRehearsalAlertRecord
): boolean {
  if (!previous) {
    return next.status !== "resolved";
  }

  return compareFreshnessAlertMaterialState(previous) !== compareFreshnessAlertMaterialState(next);
}

export async function syncDatabaseRehearsalFreshnessState(
  repository: ControlGovernanceRepository | undefined,
  environment: string,
  options: {
    freshnessWindowMs?: number;
    nowMs?: number;
  } = {}
): Promise<ControlRecoveryRehearsalOperationalStatus | undefined> {
  if (!repository) {
    return undefined;
  }

  const nowMs = options.nowMs ?? Date.now();
  const evidenceHistory = await repository.listDatabaseRehearsalEvidence(environment, 200);
  const current = buildDatabaseRehearsalFreshnessStatus(evidenceHistory, {
    environment,
    freshnessWindowMs: options.freshnessWindowMs,
    nowMs,
  });
  const previous = await repository.loadDatabaseRehearsalFreshnessAlert(environment);
  const next = prepareDatabaseRehearsalAlertRecord(environment, current, previous, new Date(nowMs).toISOString());
  const transitionAction = alertEventActionForTransition(previous, next);

  if (shouldPersistFreshnessAlert(previous, next)) {
    await repository.saveDatabaseRehearsalFreshnessAlert(next);
    await repository.recordDatabaseRehearsalFreshnessAlertEvent({
      id: buildAuditEventId(),
      environment,
      alertId: next.id,
      action: transitionAction,
      accepted: true,
      beforeStatus: previous?.status,
      afterStatus: next.status,
      reasonCode: next.reasonCode,
      summary: next.summary,
      metadata: {
        freshnessStatus: next.freshnessStatus,
        blockedByFreshness: next.blockedByFreshness,
        automationHealth: next.automationHealth,
        repeatedAutomationFailureCount: next.repeatedAutomationFailureCount,
      },
      createdAt: new Date(nowMs).toISOString(),
    });
  }

  return {
    ...current,
    notification: next.notification ?? current.notification ?? current.alert?.notification,
    alert: shouldPersistFreshnessAlert(previous, next) ? next : previous ? next : current.alert,
    hasOpenAlert: current.hasOpenAlert,
    lastEvaluatedAt: current.lastEvaluatedAt,
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
