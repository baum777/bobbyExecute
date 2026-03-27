export type HealthStatus = 'OK' | 'DEGRADED' | 'FAIL';
export type BotStatus = 'running' | 'paused' | 'stopped';
export type AdapterStatus = 'healthy' | 'degraded' | 'down';
export type DecisionAction = 'allow' | 'block' | 'abort';

export interface KillSwitchState {
  halted: boolean;
  reason?: string;
  triggeredAt?: string;
}

export interface HealthResponse {
  status: HealthStatus;
  uptimeMs: number;
  version: string;
  killSwitch?: KillSwitchState;
}

export interface SummaryResponse {
  botStatus: BotStatus;
  riskScore: number;
  chaosPassRate: number;
  dataQuality: number;
  lastDecisionAt: string | null;
  tradesToday: number;
}

export interface Adapter {
  id: string;
  status: AdapterStatus;
  latencyMs: number;
  lastSuccessAt: string;
  consecutiveFailures: number;
}

export interface AdaptersResponse {
  adapters: Adapter[];
}

export interface Decision {
  id: string;
  timestamp: string;
  action: DecisionAction;
  token: string;
  confidence: number;
  reasons: string[];
}

export interface DecisionsResponse {
  decisions: Decision[];
}

export interface MetricsResponse {
  p95LatencyMs: Record<string, number>;
}

export type WorkerRestartMethod = 'deploy_hook' | 'render_api';
export type WorkerRestartRecordStatus = 'requested' | 'dispatched' | 'converged' | 'failed' | 'rejected' | 'cooldown' | 'unconfigured';
export type WorkerRestartAlertSeverity = 'info' | 'warning' | 'critical';
export type WorkerRestartAlertStatus = 'open' | 'acknowledged' | 'resolved';
export type WorkerRestartAlertSourceCategory =
  | 'orchestration_failure'
  | 'restart_timeout'
  | 'missing_worker_heartbeat'
  | 'applied_version_stalled'
  | 'repeated_restart_failures'
  | 'convergence_timeout';
export type WorkerRestartAlertNotificationEventType =
  | 'alert_opened'
  | 'alert_escalated'
  | 'alert_acknowledged'
  | 'alert_resolved'
  | 'alert_repeated_failure_summary';
export type WorkerRestartAlertNotificationStatus = 'pending' | 'sent' | 'skipped' | 'suppressed' | 'failed';

export interface WorkerRestartAlertNotificationSummary {
  externallyNotified: boolean;
  sinkName?: string;
  sinkType?: string;
  eventType?: WorkerRestartAlertNotificationEventType;
  latestDeliveryStatus?: WorkerRestartAlertNotificationStatus;
  attemptCount: number;
  lastAttemptedAt?: string;
  lastFailureReason?: string;
  suppressionReason?: string;
  dedupeKey?: string;
  payloadFingerprint?: string;
}

export interface WorkerRestartStatus {
  required: boolean;
  requested: boolean;
  inProgress: boolean;
  pendingVersionId?: string;
  restartRequiredReason?: string;
  requestId?: string;
  requestedAt?: string;
  requestedBy?: string;
  lastOutcome?: WorkerRestartRecordStatus;
  lastOutcomeAt?: string;
  lastOutcomeReason?: string;
  method?: WorkerRestartMethod;
  targetService?: string;
  targetWorker?: string;
  convergenceObservedAt?: string;
  clearedAt?: string;
  lastHeartbeatAt?: string;
  lastAppliedVersionId?: string;
  deadlineAt?: string;
}

export interface WorkerRestartAlertRecord {
  id: string;
  environment: string;
  dedupeKey: string;
  restartRequestId?: string;
  workerService: string;
  targetWorker?: string;
  targetVersionId?: string;
  sourceCategory: WorkerRestartAlertSourceCategory;
  reasonCode: string;
  severity: WorkerRestartAlertSeverity;
  status: WorkerRestartAlertStatus;
  summary: string;
  recommendedAction: string;
  metadata?: Record<string, unknown>;
  conditionSignature: string;
  occurrenceCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
  lastEvaluatedAt: string;
  acknowledgedAt?: string;
  acknowledgedBy?: string;
  acknowledgmentNote?: string;
  resolvedAt?: string;
  resolvedBy?: string;
  resolutionNote?: string;
  lastRestartRequestStatus?: WorkerRestartRecordStatus;
  lastRestartRequestUpdatedAt?: string;
  lastWorkerHeartbeatAt?: string;
  lastAppliedVersionId?: string;
  requestedVersionId?: string;
  notification?: WorkerRestartAlertNotificationSummary;
  createdAt: string;
  updatedAt: string;
}

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
  externalNotificationCount?: number;
  notificationFailureCount?: number;
  notificationSuppressedCount?: number;
  latestNotificationStatus?: WorkerRestartAlertNotificationStatus;
  latestNotificationAt?: string;
  latestNotificationFailureReason?: string;
  latestNotificationSuppressionReason?: string;
  lastEvaluatedAt?: string;
}

export interface ControlWorkerStatus {
  workerId: string;
  lastHeartbeatAt?: string;
  lastCycleAt?: string;
  lastSeenReloadNonce?: number;
  lastAppliedVersionId?: string;
  lastValidVersionId?: string;
  degraded?: boolean;
  degradedReason?: string;
  errorState?: string;
  observedAt?: string;
}

export interface ControlRuntimeConfigStatus {
  requestedMode?: string;
  appliedMode?: string;
  requestedVersionId?: string;
  appliedVersionId?: string;
  lastValidVersionId?: string;
  pendingApply?: boolean;
  requiresRestart?: boolean;
  pendingReason?: string;
  reloadNonce?: number;
  paused?: boolean;
  pauseScope?: string;
  pauseReason?: string;
  killSwitch?: boolean;
  killSwitchReason?: string;
  degraded?: boolean;
  degradedReason?: string;
}

export interface ControlStatusResponse {
  success: true;
  worker?: ControlWorkerStatus;
  runtimeConfig?: ControlRuntimeConfigStatus;
  controlView?: ControlRuntimeConfigStatus;
  restart?: WorkerRestartStatus;
  restartAlerts?: WorkerRestartAlertSummary;
  killSwitch: KillSwitchState;
  liveControl: Record<string, unknown>;
}

export interface RestartWorkerRequest {
  reason?: string;
  idempotencyKey?: string;
}

export interface RestartAlertListResponse {
  success: true;
  summary: WorkerRestartAlertSummary;
  alerts: WorkerRestartAlertRecord[];
}

export interface RestartAlertActionRequest {
  note?: string;
}

export interface RestartAlertActionResponse {
  success: boolean;
  accepted: boolean;
  message: string;
  reason?: string;
  alert?: WorkerRestartAlertRecord;
  summary: WorkerRestartAlertSummary;
}

export type RestartWorkerResponse = Omit<ControlStatusResponse, 'success'> & {
  success: boolean;
  accepted: boolean;
  message: string;
  reason?: string;
  targetService: string;
  targetVersionId?: string;
  orchestrationMethod: WorkerRestartMethod;
};

export interface MarketResponse {
  mci: { value: number | null; reason: string | null };
  bci: { value: number | null; reason: string | null };
  hybrid: { value: number | null; reason: string | null };
}

export interface EmergencyStopResponse {
  success: boolean;
  message: string;
  state: KillSwitchState;
}

export interface ResetResponse {
  success: boolean;
  message: string;
  state: { halted: boolean };
}
