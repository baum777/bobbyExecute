import { randomUUID } from "node:crypto";
import type { RuntimeWorkerVisibility } from "../persistence/runtime-visibility-repository.js";
import type { WorkerRestartRecordStatus, WorkerRestartRepository, WorkerRestartRequestRecord } from "../persistence/worker-restart-repository.js";
import type { WorkerRestartSnapshot } from "./worker-restart-service.js";
import type {
  WorkerRestartAlertEventRecord,
  WorkerRestartAlertNotificationEventType,
  WorkerRestartAlertNotificationStatus,
  WorkerRestartAlertNotificationSummary,
  WorkerRestartAlertRecord,
  WorkerRestartAlertRepository,
  WorkerRestartAlertSeverity,
  WorkerRestartAlertSourceCategory,
  WorkerRestartAlertStatus,
} from "../persistence/worker-restart-alert-repository.js";
import type { WorkerRestartNotificationService } from "./worker-restart-notification-service.js";

export interface WorkerRestartAlertSummary {
  environment: string;
  workerService: string;
  latestRestartRequestStatus?: WorkerRestartRecordStatus;
  lastSuccessfulRestartConvergenceAt?: string;
  openAlertCount: number;
  acknowledgedAlertCount: number;
  resolvedAlertCount: number;
  activeAlertCount: number;
  stalledRestartCount: number;
  highestOpenSeverity?: WorkerRestartAlertSeverity;
  divergenceAlerting: boolean;
  openSourceCategories: WorkerRestartAlertSourceCategory[];
  externalNotificationCount: number;
  notificationFailureCount: number;
  notificationSuppressedCount: number;
  latestNotificationStatus?: WorkerRestartAlertNotificationStatus;
  latestNotificationAt?: string;
  latestNotificationFailureReason?: string;
  latestNotificationSuppressionReason?: string;
  lastEvaluatedAt?: string;
}

export interface WorkerRestartAlertListResponse {
  summary: WorkerRestartAlertSummary;
  alerts: WorkerRestartAlertRecord[];
}

export interface WorkerRestartAlertActionResponse {
  accepted: boolean;
  message: string;
  reason?: string;
  statusCode: number;
  alert?: WorkerRestartAlertRecord;
  summary: WorkerRestartAlertSummary;
}

export interface WorkerRestartAlertServiceOptions {
  environment: string;
  workerServiceName: string;
  restartRepository: WorkerRestartRepository;
  alertRepository: WorkerRestartAlertRepository;
  convergenceTimeoutMs?: number;
  quietWindowMs?: number;
  repeatWindowMs?: number;
  repeatFailureThreshold?: number;
  notificationService?: WorkerRestartNotificationService;
  logger?: Pick<Console, "info" | "warn" | "error">;
}

interface AlertEvaluation {
  dedupeKey: string;
  restartRequestId?: string;
  sourceCategory: WorkerRestartAlertSourceCategory;
  reasonCode: string;
  severity: WorkerRestartAlertSeverity;
  summary: string;
  recommendedAction: string;
  targetWorker?: string;
  targetVersionId?: string;
  conditionSignature: string;
  metadata: Record<string, unknown>;
  lastRestartRequestStatus?: WorkerRestartRecordStatus;
  lastRestartRequestUpdatedAt?: string;
  lastWorkerHeartbeatAt?: string;
  lastAppliedVersionId?: string;
  requestedVersionId?: string;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function nowIso(): string {
  return new Date().toISOString();
}

function isProductionEnvironment(environment: string): boolean {
  return environment.trim().toLowerCase() === "production";
}

function pickLatestSuccessfulConvergence(records: WorkerRestartRequestRecord[]): string | undefined {
  const converged = records
    .filter((record) => record.status === "converged" && record.convergenceObservedAt)
    .sort((left, right) => Date.parse(String(right.convergenceObservedAt ?? right.updatedAt)) - Date.parse(String(left.convergenceObservedAt ?? left.updatedAt)));
  return converged[0]?.convergenceObservedAt;
}

function buildSummary(
  environment: string,
  workerServiceName: string,
  alerts: WorkerRestartAlertRecord[],
  latestRestartRequestStatus?: WorkerRestartRecordStatus,
  lastSuccessfulRestartConvergenceAt?: string,
  lastEvaluatedAt?: string
): WorkerRestartAlertSummary {
  const activeAlerts = alerts.filter((alert) => alert.status !== "resolved");
  const openAlerts = activeAlerts.filter((alert) => alert.status === "open");
  const acknowledgedAlerts = activeAlerts.filter((alert) => alert.status === "acknowledged");
  const notificationStates = alerts.map((alert) => alert.notification).filter(Boolean) as WorkerRestartAlertNotificationSummary[];
  const externalNotificationCount = notificationStates.filter((state) => state.externallyNotified).length;
  const notificationFailureCount = notificationStates.filter((state) => state.latestDeliveryStatus === "failed").length;
  const notificationSuppressedCount = notificationStates.filter((state) =>
    state.latestDeliveryStatus === "suppressed" || state.latestDeliveryStatus === "skipped"
  ).length;
  const latestNotification = notificationStates
    .filter((state) => Boolean(state.lastAttemptedAt))
    .sort((left, right) => Date.parse(String(right.lastAttemptedAt)) - Date.parse(String(left.lastAttemptedAt)))[0];
  const highestOpenSeverity = activeAlerts.reduce<WorkerRestartAlertSeverity | undefined>((current, alert) => {
    if (!current) return alert.severity;
    if (current === "critical") return current;
    if (alert.severity === "critical") return "critical";
    if (current === "warning") return current;
    if (alert.severity === "warning") return "warning";
    return current;
  }, undefined);

  return {
    environment,
    workerService: workerServiceName,
    latestRestartRequestStatus,
    lastSuccessfulRestartConvergenceAt,
    openAlertCount: openAlerts.length,
    acknowledgedAlertCount: acknowledgedAlerts.length,
    resolvedAlertCount: alerts.filter((alert) => alert.status === "resolved").length,
    activeAlertCount: activeAlerts.length,
    stalledRestartCount: activeAlerts.filter((alert) =>
      alert.sourceCategory === "restart_timeout" ||
      alert.sourceCategory === "missing_worker_heartbeat" ||
      alert.sourceCategory === "applied_version_stalled" ||
      alert.sourceCategory === "convergence_timeout"
    ).length,
    highestOpenSeverity,
    divergenceAlerting: activeAlerts.length > 0,
    openSourceCategories: [...new Set(activeAlerts.map((alert) => alert.sourceCategory))],
    externalNotificationCount,
    notificationFailureCount,
    notificationSuppressedCount,
    latestNotificationStatus: latestNotification?.latestDeliveryStatus,
    latestNotificationAt: latestNotification?.lastAttemptedAt,
    latestNotificationFailureReason: latestNotification?.lastFailureReason,
    latestNotificationSuppressionReason: latestNotification?.suppressionReason,
    lastEvaluatedAt,
  };
}

function buildFallbackSummary(
  environment: string,
  workerServiceName: string,
  snapshot: WorkerRestartSnapshot,
  lastEvaluatedAt?: string
): WorkerRestartAlertSummary {
  return {
    environment,
    workerService: workerServiceName,
    latestRestartRequestStatus: snapshot.request?.status,
    lastSuccessfulRestartConvergenceAt: snapshot.restart.clearedAt ?? snapshot.request?.clearedAt,
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
    lastEvaluatedAt,
  };
}

function safeString(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : fallback;
}

function categorySeverity(category: WorkerRestartAlertSourceCategory, environment: string): WorkerRestartAlertSeverity {
  if (category === "repeated_restart_failures") {
    return "critical";
  }
  if (category === "convergence_timeout" || category === "missing_worker_heartbeat" || category === "applied_version_stalled") {
    return isProductionEnvironment(environment) ? "critical" : "warning";
  }
  return "warning";
}

function buildActionableRecommendation(category: WorkerRestartAlertSourceCategory): string {
  switch (category) {
    case "orchestration_failure":
      return "Check the Render deploy hook, worker service wiring, and restart request history.";
    case "restart_timeout":
      return "Inspect worker heartbeat and confirm whether the restart is still converging.";
    case "missing_worker_heartbeat":
      return "Inspect the worker process and Render restart state; the worker is not heartbeating after the restart request.";
    case "applied_version_stalled":
      return "Inspect worker logs and runtime visibility; the worker heartbeat resumed but the requested version did not apply.";
    case "repeated_restart_failures":
      return "Pause restart attempts and fix the underlying worker or orchestration issue before retrying.";
    case "convergence_timeout":
      return "Investigate the worker restart path immediately; the requested version did not converge before the deadline.";
    default:
      return "Review the restart request and worker status.";
  }
}

function buildReasonCode(category: WorkerRestartAlertSourceCategory): string {
  switch (category) {
    case "orchestration_failure":
      return "orchestration_failed";
    case "restart_timeout":
      return "restart_timeout";
    case "missing_worker_heartbeat":
      return "worker_heartbeat_missing";
    case "applied_version_stalled":
      return "applied_version_stalled";
    case "repeated_restart_failures":
      return "repeated_restart_failures";
    case "convergence_timeout":
      return "convergence_timeout";
    default:
      return "restart_alert";
  }
}

function buildConditionSignature(input: {
  category: WorkerRestartAlertSourceCategory;
  restartRequestId?: string;
  requestStatus?: WorkerRestartRecordStatus;
  requestedVersionId?: string;
  targetVersionId?: string;
  workerHeartbeatAt?: string;
  appliedVersionId?: string;
  failureIds?: string[];
  failureCount?: number;
  deadlineAt?: string;
}): string {
  return JSON.stringify({
    category: input.category,
    restartRequestId: input.restartRequestId ?? null,
    requestStatus: input.requestStatus ?? null,
    requestedVersionId: input.requestedVersionId ?? null,
    targetVersionId: input.targetVersionId ?? null,
    workerHeartbeatAt: input.workerHeartbeatAt ?? null,
    appliedVersionId: input.appliedVersionId ?? null,
    failureIds: input.failureIds ?? [],
    failureCount: input.failureCount ?? null,
    deadlineAt: input.deadlineAt ?? null,
  });
}

function workerHeartbeatAgeMs(worker?: RuntimeWorkerVisibility): number | undefined {
  if (!worker?.lastHeartbeatAt) {
    return undefined;
  }

  const parsed = Date.parse(worker.lastHeartbeatAt);
  if (!Number.isFinite(parsed)) {
    return undefined;
  }

  return Math.max(0, Date.now() - parsed);
}

function buildRequestEvaluation(
  environment: string,
  workerServiceName: string,
  snapshot: WorkerRestartSnapshot,
  request: WorkerRestartRequestRecord,
  convergenceTimeoutMs: number
): AlertEvaluation | null {
  const worker = snapshot.worker;
  const requestedVersionId = request.targetVersionId ?? snapshot.runtimeConfig.requestedVersionId ?? snapshot.runtimeConfig.appliedVersionId;
  const targetVersionId = requestedVersionId;
  const heartbeatAt = worker?.lastHeartbeatAt;
  const appliedVersionId = worker?.lastAppliedVersionId ?? snapshot.runtimeConfig.appliedVersionId;
  const requestedAt = Date.parse(request.requestedAt);
  const elapsedMs = Number.isFinite(requestedAt) ? Math.max(0, Date.now() - requestedAt) : 0;
  const heartbeatMs = workerHeartbeatAgeMs(worker);
  const softTimeoutMs = Math.max(15_000, Math.min(convergenceTimeoutMs - 1, Math.floor(convergenceTimeoutMs / 2)));
  const heartbeatTimeoutMs = Math.max(5_000, Math.min(30_000, Math.floor(softTimeoutMs / 2)));
  const deadlineAt = request.deadlineAt ?? new Date(requestedAt + convergenceTimeoutMs).toISOString();

  if (request.status === "unconfigured") {
    const category: WorkerRestartAlertSourceCategory = "orchestration_failure";
    return {
      dedupeKey: `request:${request.id}`,
      restartRequestId: request.id,
      sourceCategory: category,
      reasonCode: buildReasonCode(category),
      severity: categorySeverity(category, environment),
      summary: `Worker restart orchestration is not configured for ${workerServiceName}`,
      recommendedAction: buildActionableRecommendation(category),
      targetWorker: request.targetWorker ?? workerServiceName,
      targetVersionId,
      conditionSignature: buildConditionSignature({
        category,
        restartRequestId: request.id,
        requestStatus: request.status,
        requestedVersionId,
        targetVersionId,
        workerHeartbeatAt: heartbeatAt,
        appliedVersionId,
        deadlineAt,
      }),
      metadata: {
        rejectionReason: request.rejectionReason,
        deadlineAt,
      },
      lastRestartRequestStatus: request.status,
      lastRestartRequestUpdatedAt: request.updatedAt,
      lastWorkerHeartbeatAt: heartbeatAt,
      lastAppliedVersionId: appliedVersionId,
      requestedVersionId,
    };
  }

  if (request.status === "failed") {
    const failureText = [request.failureReason, request.providerMessage, request.rejectionReason].filter(Boolean).join(" ").toLowerCase();
    const category: WorkerRestartAlertSourceCategory =
      failureText.includes("converge") || failureText.includes("deadline")
        ? "convergence_timeout"
        : "orchestration_failure";
    return {
      dedupeKey: `request:${request.id}`,
      restartRequestId: request.id,
      sourceCategory: category,
      reasonCode: buildReasonCode(category),
      severity: categorySeverity(category, environment),
      summary:
        category === "convergence_timeout"
          ? `Restart request ${request.id} for ${workerServiceName} did not converge before the deadline`
          : `Restart orchestration failed for ${workerServiceName}`,
      recommendedAction: buildActionableRecommendation(category),
      targetWorker: request.targetWorker ?? workerServiceName,
      targetVersionId,
      conditionSignature: buildConditionSignature({
        category,
        restartRequestId: request.id,
        requestStatus: request.status,
        requestedVersionId,
        targetVersionId,
        workerHeartbeatAt: heartbeatAt,
        appliedVersionId,
        deadlineAt,
      }),
      metadata: {
        failureReason: request.failureReason,
        rejectionReason: request.rejectionReason,
        providerMessage: request.providerMessage,
        providerStatusCode: request.providerStatusCode,
        deadlineAt,
      },
      lastRestartRequestStatus: request.status,
      lastRestartRequestUpdatedAt: request.updatedAt,
      lastWorkerHeartbeatAt: heartbeatAt,
      lastAppliedVersionId: appliedVersionId,
      requestedVersionId,
    };
  }

  if (request.status !== "requested" && request.status !== "dispatched") {
    return null;
  }

  if (elapsedMs >= convergenceTimeoutMs) {
    const category: WorkerRestartAlertSourceCategory = "convergence_timeout";
    return {
      dedupeKey: `request:${request.id}`,
      restartRequestId: request.id,
      sourceCategory: category,
      reasonCode: buildReasonCode(category),
      severity: categorySeverity(category, environment),
      summary: `Restart request ${request.id} for ${workerServiceName} did not converge before the deadline`,
      recommendedAction: buildActionableRecommendation(category),
      targetWorker: request.targetWorker ?? workerServiceName,
      targetVersionId,
      conditionSignature: buildConditionSignature({
        category,
        restartRequestId: request.id,
        requestStatus: request.status,
        requestedVersionId,
        targetVersionId,
        workerHeartbeatAt: heartbeatAt,
        appliedVersionId,
        deadlineAt,
      }),
      metadata: {
        requestedAt: request.requestedAt,
        deadlineAt,
        workerHeartbeatAt: heartbeatAt,
        heartbeatAgeMs: heartbeatMs,
        appliedVersionId,
        requestedVersionId,
      },
      lastRestartRequestStatus: request.status,
      lastRestartRequestUpdatedAt: request.updatedAt,
      lastWorkerHeartbeatAt: heartbeatAt,
      lastAppliedVersionId: appliedVersionId,
      requestedVersionId,
    };
  }

  if (elapsedMs >= heartbeatTimeoutMs) {
    if (!heartbeatAt || Date.parse(heartbeatAt) <= requestedAt) {
      const category: WorkerRestartAlertSourceCategory = "missing_worker_heartbeat";
      return {
        dedupeKey: `request:${request.id}`,
        restartRequestId: request.id,
        sourceCategory: category,
        reasonCode: buildReasonCode(category),
        severity: categorySeverity(category, environment),
        summary: `Worker ${workerServiceName} has not refreshed its heartbeat since restart request ${request.id}`,
        recommendedAction: buildActionableRecommendation(category),
        targetWorker: request.targetWorker ?? workerServiceName,
        targetVersionId,
        conditionSignature: buildConditionSignature({
          category,
          restartRequestId: request.id,
          requestStatus: request.status,
          requestedVersionId,
          targetVersionId,
          workerHeartbeatAt: heartbeatAt,
          appliedVersionId,
          deadlineAt,
        }),
        metadata: {
          requestedAt: request.requestedAt,
          heartbeatTimeoutMs,
          heartbeatAgeMs: heartbeatMs,
          deadlineAt,
          workerHeartbeatAt: heartbeatAt,
          appliedVersionId,
          requestedVersionId,
        },
        lastRestartRequestStatus: request.status,
        lastRestartRequestUpdatedAt: request.updatedAt,
        lastWorkerHeartbeatAt: heartbeatAt,
        lastAppliedVersionId: appliedVersionId,
        requestedVersionId,
      };
    }

    if (appliedVersionId !== requestedVersionId) {
      const category: WorkerRestartAlertSourceCategory = "applied_version_stalled";
      return {
        dedupeKey: `request:${request.id}`,
        restartRequestId: request.id,
        sourceCategory: category,
        reasonCode: buildReasonCode(category),
        severity: categorySeverity(category, environment),
        summary: `Worker ${workerServiceName} is heartbeating but has not applied requested version ${safeString(requestedVersionId, "unknown")}`,
        recommendedAction: buildActionableRecommendation(category),
        targetWorker: request.targetWorker ?? workerServiceName,
        targetVersionId,
        conditionSignature: buildConditionSignature({
          category,
          restartRequestId: request.id,
          requestStatus: request.status,
          requestedVersionId,
          targetVersionId,
          workerHeartbeatAt: heartbeatAt,
          appliedVersionId,
          deadlineAt,
        }),
        metadata: {
          requestedAt: request.requestedAt,
          heartbeatTimeoutMs,
          heartbeatAgeMs: heartbeatMs,
          deadlineAt,
          workerHeartbeatAt: heartbeatAt,
          appliedVersionId,
          requestedVersionId,
        },
        lastRestartRequestStatus: request.status,
        lastRestartRequestUpdatedAt: request.updatedAt,
        lastWorkerHeartbeatAt: heartbeatAt,
        lastAppliedVersionId: appliedVersionId,
        requestedVersionId,
      };
    }

    const category: WorkerRestartAlertSourceCategory = "restart_timeout";
    return {
      dedupeKey: `request:${request.id}`,
      restartRequestId: request.id,
      sourceCategory: category,
      reasonCode: buildReasonCode(category),
      severity: categorySeverity(category, environment),
      summary: `Restart request ${request.id} for ${workerServiceName} has not converged yet`,
      recommendedAction: buildActionableRecommendation(category),
      targetWorker: request.targetWorker ?? workerServiceName,
      targetVersionId,
      conditionSignature: buildConditionSignature({
        category,
        restartRequestId: request.id,
        requestStatus: request.status,
        requestedVersionId,
        targetVersionId,
        workerHeartbeatAt: heartbeatAt,
        appliedVersionId,
        deadlineAt,
      }),
      metadata: {
        requestedAt: request.requestedAt,
        heartbeatTimeoutMs,
        heartbeatAgeMs: heartbeatMs,
        deadlineAt,
        workerHeartbeatAt: heartbeatAt,
        appliedVersionId,
        requestedVersionId,
      },
      lastRestartRequestStatus: request.status,
      lastRestartRequestUpdatedAt: request.updatedAt,
      lastWorkerHeartbeatAt: heartbeatAt,
      lastAppliedVersionId: appliedVersionId,
      requestedVersionId,
    };
  }

  return null;
}

function buildRepeatedFailureEvaluation(
  environment: string,
  workerServiceName: string,
  snapshot: WorkerRestartSnapshot,
  recentRequests: WorkerRestartRequestRecord[],
  repeatWindowMs: number,
  repeatFailureThreshold: number
): AlertEvaluation | null {
  const failureStatuses: WorkerRestartRecordStatus[] = ["failed", "rejected", "cooldown", "unconfigured"];
  const now = Date.now();
  const recentFailures = recentRequests
    .filter((record) => failureStatuses.includes(record.status))
    .filter((record) => {
      const anchor = Date.parse(record.updatedAt ?? record.requestedAt);
      return Number.isFinite(anchor) && now - anchor <= repeatWindowMs;
    })
    .sort((left, right) => Date.parse(right.updatedAt ?? right.requestedAt) - Date.parse(left.updatedAt ?? left.requestedAt));

  if (recentFailures.length < repeatFailureThreshold) {
    return null;
  }

  const latestFailure = recentFailures[0];
  const category: WorkerRestartAlertSourceCategory = "repeated_restart_failures";
  const failureIds = recentFailures.map((record) => record.id);
  return {
    dedupeKey: `repeat:${environment}:${workerServiceName}`,
    restartRequestId: latestFailure.id,
    sourceCategory: category,
    reasonCode: buildReasonCode(category),
    severity: categorySeverity(category, environment),
    summary: `${recentFailures.length} restart failures were observed for ${workerServiceName} within the rolling window`,
    recommendedAction: buildActionableRecommendation(category),
    targetWorker: latestFailure.targetWorker ?? workerServiceName,
    targetVersionId: latestFailure.targetVersionId ?? snapshot.restart.pendingVersionId ?? snapshot.runtimeConfig.requestedVersionId,
    conditionSignature: buildConditionSignature({
      category,
      restartRequestId: latestFailure.id,
      requestStatus: latestFailure.status,
      requestedVersionId: latestFailure.targetVersionId ?? snapshot.runtimeConfig.requestedVersionId,
      targetVersionId: latestFailure.targetVersionId ?? snapshot.runtimeConfig.requestedVersionId,
      failureIds,
      failureCount: recentFailures.length,
    }),
    metadata: {
      repeatWindowMs,
      repeatFailureThreshold,
      failureCount: recentFailures.length,
      failureIds,
      latestFailureStatus: latestFailure.status,
      latestFailureReason: latestFailure.failureReason ?? latestFailure.rejectionReason ?? latestFailure.providerMessage,
    },
    lastRestartRequestStatus: latestFailure.status,
    lastRestartRequestUpdatedAt: latestFailure.updatedAt,
    lastWorkerHeartbeatAt: snapshot.worker?.lastHeartbeatAt,
    lastAppliedVersionId: snapshot.worker?.lastAppliedVersionId ?? snapshot.runtimeConfig.appliedVersionId,
    requestedVersionId: latestFailure.targetVersionId ?? snapshot.runtimeConfig.requestedVersionId,
  };
}

function buildDesiredEvaluations(
  environment: string,
  workerServiceName: string,
  snapshot: WorkerRestartSnapshot,
  recentRequests: WorkerRestartRequestRecord[],
  convergenceTimeoutMs: number,
  repeatWindowMs: number,
  repeatFailureThreshold: number
): AlertEvaluation[] {
  const evaluations: AlertEvaluation[] = [];
  const latestRequest = snapshot.request ?? recentRequests[0] ?? null;
  if (latestRequest) {
    const requestEvaluation = buildRequestEvaluation(environment, workerServiceName, snapshot, latestRequest, convergenceTimeoutMs);
    if (requestEvaluation) {
      evaluations.push(requestEvaluation);
    }
  }

  const repeatedFailureEvaluation = buildRepeatedFailureEvaluation(
    environment,
    workerServiceName,
    snapshot,
    recentRequests,
    repeatWindowMs,
    repeatFailureThreshold
  );
  if (repeatedFailureEvaluation) {
    evaluations.push(repeatedFailureEvaluation);
  }

  return evaluations;
}

export class WorkerRestartAlertService {
  constructor(private readonly deps: WorkerRestartAlertServiceOptions) {}

  private get quietWindowMs(): number {
    return this.deps.quietWindowMs ?? 60_000;
  }

  private get convergenceTimeoutMs(): number {
    return this.deps.convergenceTimeoutMs ?? 10 * 60 * 1000;
  }

  private get repeatWindowMs(): number {
    return this.deps.repeatWindowMs ?? Math.max(this.convergenceTimeoutMs * 2, 30 * 60 * 1000);
  }

  private get repeatFailureThreshold(): number {
    return this.deps.repeatFailureThreshold ?? 2;
  }

  private async enrichAlert(alert: WorkerRestartAlertRecord): Promise<WorkerRestartAlertRecord> {
    if (!this.deps.notificationService) {
      return alert;
    }

    return this.deps.notificationService.summarizeAlert(alert);
  }

  private async enrichAlerts(alerts: WorkerRestartAlertRecord[]): Promise<WorkerRestartAlertRecord[]> {
    if (!this.deps.notificationService) {
      return alerts;
    }

    return this.deps.notificationService.summarizeAlerts(alerts);
  }

  private async dispatchNotification(
    alert: WorkerRestartAlertRecord,
    eventType: WorkerRestartAlertNotificationEventType,
    note?: string
  ): Promise<void> {
    if (!this.deps.notificationService) {
      return;
    }

    try {
      await this.deps.notificationService.dispatch({
        actor: "system",
        alert: clone(alert),
        eventType,
        note,
      });
    } catch (error) {
      await this.deps.alertRepository.recordEvent({
        id: randomUUID(),
        environment: alert.environment,
        alertId: alert.id,
        action: "notification_failed",
        actor: "notification_bridge",
        accepted: false,
        beforeStatus: alert.status,
        afterStatus: alert.status,
        reasonCode: alert.reasonCode,
        summary: alert.summary,
        note: error instanceof Error ? error.message : String(error),
        metadata: {
          eventType,
          dedupeKey: alert.dedupeKey,
          sourceCategory: alert.sourceCategory,
        },
        notificationEventType: eventType,
        notificationStatus: "failed",
        notificationScope: "external",
        createdAt: nowIso(),
      });
    }
  }

  private async recordTransition(
    action: WorkerRestartAlertEventRecord["action"],
    alert: WorkerRestartAlertRecord,
    actor: string,
    accepted: boolean,
    note?: string,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    await this.deps.alertRepository.recordEvent({
      id: randomUUID(),
      environment: alert.environment,
      alertId: alert.id,
      action,
      actor,
      accepted,
      beforeStatus: alert.status,
      afterStatus: alert.status,
      reasonCode: alert.reasonCode,
      summary: alert.summary,
      note,
      metadata,
      createdAt: nowIso(),
    });
  }

  private async persistActiveAlert(
    existing: WorkerRestartAlertRecord | null,
    evaluation: AlertEvaluation,
    now: string
  ): Promise<WorkerRestartAlertRecord | null> {
    const currentStatus: WorkerRestartAlertStatus = existing?.status === "acknowledged" ? "acknowledged" : "open";
    const isReopened = existing?.status === "resolved";
    const conditionChanged = !existing || existing.conditionSignature !== evaluation.conditionSignature;
    const severityChanged = existing?.severity !== evaluation.severity;
    const statusChanged = !existing || existing.status !== currentStatus || isReopened;
    const shouldIncrementOccurrence =
      !existing || isReopened || conditionChanged || severityChanged || Date.parse(now) - Date.parse(existing.lastSeenAt) >= this.quietWindowMs;

    if (
      existing &&
      !isReopened &&
      !conditionChanged &&
      !severityChanged &&
      !statusChanged &&
      !shouldIncrementOccurrence
    ) {
      return existing;
    }

    const alert: WorkerRestartAlertRecord = {
      id: existing?.id ?? randomUUID(),
      environment: this.deps.environment,
      dedupeKey: evaluation.dedupeKey,
      restartRequestId: evaluation.restartRequestId,
      workerService: this.deps.workerServiceName,
      targetWorker: evaluation.targetWorker,
      targetVersionId: evaluation.targetVersionId,
      sourceCategory: evaluation.sourceCategory,
      reasonCode: evaluation.reasonCode,
      severity: evaluation.severity,
      status: currentStatus,
      summary: evaluation.summary,
      recommendedAction: evaluation.recommendedAction,
      metadata: clone(evaluation.metadata),
      conditionSignature: evaluation.conditionSignature,
      occurrenceCount: existing ? existing.occurrenceCount + (shouldIncrementOccurrence ? 1 : 0) : 1,
      firstSeenAt: existing && !isReopened ? existing.firstSeenAt : now,
      lastSeenAt: now,
      lastEvaluatedAt: now,
      acknowledgedAt: currentStatus === "acknowledged" ? existing?.acknowledgedAt ?? now : undefined,
      acknowledgedBy: currentStatus === "acknowledged" ? existing?.acknowledgedBy : undefined,
      acknowledgmentNote: currentStatus === "acknowledged" ? existing?.acknowledgmentNote : undefined,
      resolvedAt: undefined,
      resolvedBy: undefined,
      resolutionNote: undefined,
      lastRestartRequestStatus: evaluation.lastRestartRequestStatus,
      lastRestartRequestUpdatedAt: evaluation.lastRestartRequestUpdatedAt,
      lastWorkerHeartbeatAt: evaluation.lastWorkerHeartbeatAt,
      lastAppliedVersionId: evaluation.lastAppliedVersionId,
      requestedVersionId: evaluation.requestedVersionId,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    await this.deps.alertRepository.save(alert);
    const action: WorkerRestartAlertEventRecord["action"] | null = !existing
      ? "opened"
      : isReopened
        ? "reopened"
        : severityChanged && evaluation.severity === "critical" && existing.severity !== "critical"
          ? "escalated"
          : conditionChanged || shouldIncrementOccurrence || statusChanged
            ? "updated"
            : null;
    const notificationEventType: WorkerRestartAlertNotificationEventType | null =
      action === "opened" || action === "reopened"
        ? alert.sourceCategory === "repeated_restart_failures"
          ? "alert_repeated_failure_summary"
          : "alert_opened"
        : action === "escalated"
          ? "alert_escalated"
          : action === "updated" && alert.sourceCategory === "repeated_restart_failures"
            ? "alert_repeated_failure_summary"
            : null;

    if (action && action !== "updated") {
      await this.deps.alertRepository.recordEvent({
        id: randomUUID(),
        environment: alert.environment,
        alertId: alert.id,
        action,
        actor: "system",
        accepted: true,
        beforeStatus: existing?.status,
        afterStatus: alert.status,
        reasonCode: alert.reasonCode,
        summary: alert.summary,
        metadata: {
          conditionSignature: alert.conditionSignature,
          restartRequestId: alert.restartRequestId,
          targetVersionId: alert.targetVersionId,
          sourceCategory: alert.sourceCategory,
          shouldIncrementOccurrence,
          statusChanged,
          ...evaluation.metadata,
        },
        createdAt: now,
      });
      if (notificationEventType) {
        await this.dispatchNotification(alert, notificationEventType);
      }
    } else if (conditionChanged || shouldIncrementOccurrence || statusChanged) {
      await this.recordTransition("updated", alert, "system", true, undefined, {
        conditionSignature: alert.conditionSignature,
        restartRequestId: alert.restartRequestId,
        targetVersionId: alert.targetVersionId,
        sourceCategory: alert.sourceCategory,
        shouldIncrementOccurrence,
        statusChanged,
      });
      if (notificationEventType) {
        await this.dispatchNotification(alert, notificationEventType);
      }
    }

    return this.enrichAlert(alert);
  }

  private async resolveAlert(existing: WorkerRestartAlertRecord, note: string, actor = "system"): Promise<WorkerRestartAlertRecord> {
    const now = nowIso();
    const resolved: WorkerRestartAlertRecord = {
      ...existing,
      status: "resolved",
      resolvedAt: now,
      resolvedBy: actor,
      resolutionNote: note,
      updatedAt: now,
      lastEvaluatedAt: now,
    };
    await this.deps.alertRepository.save(resolved);
    await this.deps.alertRepository.recordEvent({
      id: randomUUID(),
      environment: resolved.environment,
      alertId: resolved.id,
      action: "resolved",
      actor,
      accepted: true,
      beforeStatus: existing.status,
      afterStatus: "resolved",
      reasonCode: resolved.reasonCode,
      summary: resolved.summary,
      note,
      metadata: {
        sourceCategory: resolved.sourceCategory,
        dedupeKey: resolved.dedupeKey,
      },
      createdAt: now,
    });
    await this.dispatchNotification(resolved, "alert_resolved", note);
    return this.enrichAlert(resolved);
  }

  private async loadCurrentEvaluations(snapshot: WorkerRestartSnapshot): Promise<{
    recentRequests: WorkerRestartRequestRecord[];
    evaluations: AlertEvaluation[];
    latestConvergenceAt?: string;
  }> {
    const recentRequests = await this.deps.restartRepository.list(this.deps.environment, 100);
    const evaluations = buildDesiredEvaluations(
      this.deps.environment,
      this.deps.workerServiceName,
      snapshot,
      recentRequests,
      this.convergenceTimeoutMs,
      this.repeatWindowMs,
      this.repeatFailureThreshold
    );
    return {
      recentRequests,
      evaluations,
      latestConvergenceAt: pickLatestSuccessfulConvergence(recentRequests),
    };
  }

  async sync(snapshot: WorkerRestartSnapshot): Promise<WorkerRestartAlertSummary> {
    const now = nowIso();
    const { recentRequests, evaluations, latestConvergenceAt } = await this.loadCurrentEvaluations(snapshot);
    const currentAlerts = await this.deps.alertRepository.list(this.deps.environment, 200);
    const byKey = new Map(currentAlerts.map((alert) => [alert.dedupeKey, alert] as const));
    const activeKeys = new Set<string>();

    for (const evaluation of evaluations) {
      activeKeys.add(evaluation.dedupeKey);
      const existing = byKey.get(evaluation.dedupeKey) ?? null;
      const updated = await this.persistActiveAlert(existing, evaluation, now);
      if (updated) {
        byKey.set(updated.dedupeKey, updated);
      }
    }

    for (const alert of currentAlerts) {
      if (activeKeys.has(alert.dedupeKey) || alert.status === "resolved") {
        continue;
      }

      const note = alert.status === "acknowledged"
        ? "restart condition cleared after acknowledgement"
        : "restart condition cleared by worker convergence";
      const resolved = await this.resolveAlert(alert, note, "system");
      byKey.set(resolved.dedupeKey, resolved);
    }

    const refreshedAlerts = await this.enrichAlerts(await this.deps.alertRepository.list(this.deps.environment, 200));
    const latestRestartRequestStatus = recentRequests[0]?.status ?? snapshot.request?.status;
    return buildSummary(
      this.deps.environment,
      this.deps.workerServiceName,
      refreshedAlerts,
      latestRestartRequestStatus,
      latestConvergenceAt,
      now
    );
  }

  async list(snapshot: WorkerRestartSnapshot, limit = 50): Promise<WorkerRestartAlertListResponse> {
    const summary = await this.sync(snapshot);
    const alerts = await this.enrichAlerts(await this.deps.alertRepository.list(this.deps.environment, limit));
    return { summary, alerts };
  }

  private async loadAlert(alertId: string): Promise<WorkerRestartAlertRecord | null> {
    return this.deps.alertRepository.load(this.deps.environment, alertId);
  }

  async acknowledge(
    snapshot: WorkerRestartSnapshot,
    alertId: string,
    input: { actor: string; note?: string }
  ): Promise<WorkerRestartAlertActionResponse> {
    const summary = await this.sync(snapshot);
    const existing = await this.loadAlert(alertId);
    if (!existing) {
      return {
        accepted: false,
        statusCode: 404,
        message: "restart alert not found",
        reason: "alert not found",
        summary,
      };
    }

    if (existing.status === "resolved") {
      await this.recordTransition("acknowledge_rejected", existing, input.actor, false, input.note, {
        reason: "alert already resolved",
      });
      return {
        accepted: false,
        statusCode: 409,
        message: "restart alert is already resolved",
        reason: "alert already resolved",
        alert: existing,
        summary,
      };
    }

    const now = nowIso();
    const updated: WorkerRestartAlertRecord = {
      ...existing,
      status: "acknowledged",
      acknowledgedAt: now,
      acknowledgedBy: input.actor,
      acknowledgmentNote: input.note ?? existing.acknowledgmentNote,
      updatedAt: now,
      lastEvaluatedAt: now,
    };
    await this.deps.alertRepository.save(updated);
    await this.deps.alertRepository.recordEvent({
      id: randomUUID(),
      environment: updated.environment,
      alertId: updated.id,
      action: "acknowledged",
      actor: input.actor,
      accepted: true,
      beforeStatus: existing.status,
      afterStatus: "acknowledged",
      reasonCode: updated.reasonCode,
      summary: updated.summary,
      note: input.note,
      metadata: {
        dedupeKey: updated.dedupeKey,
        sourceCategory: updated.sourceCategory,
      },
      createdAt: now,
    });
    await this.dispatchNotification(updated, "alert_acknowledged", input.note);
    return {
      accepted: true,
      statusCode: 200,
      message: "restart alert acknowledged",
      alert: await this.enrichAlert(updated),
      summary: await this.sync(snapshot),
    };
  }

  async resolve(
    snapshot: WorkerRestartSnapshot,
    alertId: string,
    input: { actor: string; note?: string }
  ): Promise<WorkerRestartAlertActionResponse> {
    const summary = await this.sync(snapshot);
    const existing = await this.loadAlert(alertId);
    if (!existing) {
      return {
        accepted: false,
        statusCode: 404,
        message: "restart alert not found",
        reason: "alert not found",
        summary,
      };
    }

    const { evaluations } = await this.loadCurrentEvaluations(snapshot);
    const stillActive = evaluations.some((evaluation) => evaluation.dedupeKey === existing.dedupeKey);
    if (stillActive) {
      await this.recordTransition("resolve_rejected", existing, input.actor, false, input.note, {
        reason: "alert condition is still active",
      });
      return {
        accepted: false,
        statusCode: 409,
        message: "restart alert cannot be resolved while the underlying condition is still active",
        reason: "alert condition is still active",
        alert: await this.enrichAlert(existing),
        summary,
      };
    }

    if (existing.status === "resolved") {
      return {
        accepted: true,
        statusCode: 200,
        message: "restart alert already resolved",
        alert: await this.enrichAlert(existing),
        summary,
      };
    }

    const resolved = await this.resolveAlert(existing, input.note ?? "manual resolution", input.actor);
    return {
      accepted: true,
      statusCode: 200,
      message: "restart alert resolved",
      alert: resolved,
      summary: await this.sync(snapshot),
    };
  }
}
