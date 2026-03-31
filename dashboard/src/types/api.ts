export type HealthStatus = 'OK' | 'DEGRADED' | 'FAIL';
export type BotStatus = 'running' | 'paused' | 'stopped';
export type AdapterStatus = 'healthy' | 'degraded' | 'down';
export type DecisionAction = 'allow' | 'block' | 'abort';
export type DashboardOperatorRole = 'viewer' | 'operator' | 'admin';
export type LivePromotionTargetMode = 'live_limited' | 'live';
export type LivePromotionWorkflowStatus = 'pending' | 'approved' | 'denied' | 'blocked' | 'applied' | 'rolled_back';
export type LivePromotionApplicationStatus = 'pending_restart' | 'applied' | 'rolled_back' | 'rejected';

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

export type KpiMetricProvenance =
  | 'wired'
  | 'derived'
  | 'default'
  | 'legacy_projection'
  | 'unwired';

export interface SummaryResponse {
  botStatus: BotStatus;
  riskScore: number;
  chaosPassRate: number;
  dataQuality: number;
  lastDecisionAt: string | null;
  tradesToday: number;
  metricProvenance?: {
    riskScore: KpiMetricProvenance;
    chaosPassRate: KpiMetricProvenance;
    dataQuality: KpiMetricProvenance;
    lastDecisionAt: KpiMetricProvenance;
    tradesToday: KpiMetricProvenance;
  };
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
  provenanceKind: 'derived';
  source: 'action_log_projection';
  actionLogAction?: string;
  actionLogAgentId?: string;
}

export interface DecisionsResponse {
  decisions: Decision[];
}

export interface MetricsResponse {
  p95LatencyMs: Record<string, number>;
}

export type WorkerRestartMethod = 'deploy_hook';
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
export type WorkerRestartDeliveryHealthHint = 'healthy' | 'degraded' | 'failing' | 'idle' | 'unknown';
export type WorkerRestartDeliveryTrendHint = 'improving' | 'stable' | 'worsening' | 'inactive' | 'insufficient_data';

export interface WorkerRestartAlertNotificationDestinationSummary {
  name: string;
  sinkType?: string;
  formatterProfile?: string;
  priority?: number;
  selected: boolean;
  latestDeliveryStatus?: WorkerRestartAlertNotificationStatus;
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

export interface WorkerRestartAlertNotificationSummary {
  externallyNotified: boolean;
  sinkName?: string;
  sinkType?: string;
  latestDestinationName?: string;
  latestDestinationType?: string;
  latestFormatterProfile?: string;
  eventType?: WorkerRestartAlertNotificationEventType;
  latestDeliveryStatus?: WorkerRestartAlertNotificationStatus;
  attemptCount: number;
  lastAttemptedAt?: string;
  lastFailureReason?: string;
  suppressionReason?: string;
  dedupeKey?: string;
  payloadFingerprint?: string;
  resolutionNotificationSent?: boolean;
  resolutionNotificationAt?: string;
  selectedDestinationCount: number;
  selectedDestinationNames: string[];
  destinations: WorkerRestartAlertNotificationDestinationSummary[];
}

export interface WorkerRestartDeliveryJournalRow {
  eventId: string;
  alertId: string;
  restartRequestId?: string;
  environment: string;
  destinationName?: string;
  destinationType?: string;
  sinkType?: string;
  formatterProfile?: string;
  eventType?: WorkerRestartAlertNotificationEventType;
  deliveryStatus?: WorkerRestartAlertNotificationStatus;
  severity?: WorkerRestartAlertSeverity;
  alertStatus?: WorkerRestartAlertStatus;
  sourceCategory?: WorkerRestartAlertSourceCategory;
  routeReason?: string;
  dedupeKey?: string;
  payloadFingerprint?: string;
  attemptedAt: string;
  attemptCount?: number;
  failureReason?: string;
  suppressionReason?: string;
  summary?: string;
}

export interface WorkerRestartDeliveryJournalResponse {
  success: true;
  windowStartAt: string;
  windowEndAt: string;
  limit: number;
  offset: number;
  totalCount: number;
  hasMore: boolean;
  deliveries: WorkerRestartDeliveryJournalRow[];
}

export interface WorkerRestartDeliverySummaryRow {
  destinationName: string;
  destinationType?: string;
  sinkType?: string;
  formatterProfile?: string;
  totalCount: number;
  sentCount: number;
  failedCount: number;
  suppressedCount: number;
  skippedCount: number;
  openAlertCount: number;
  recentEnvironments: string[];
  recentEventTypes: WorkerRestartAlertNotificationEventType[];
  lastActivityAt?: string;
  lastSentAt?: string;
  lastFailedAt?: string;
  lastSuppressedAt?: string;
  lastSkippedAt?: string;
  lastFailureReason?: string;
  latestRouteReason?: string;
  healthHint: WorkerRestartDeliveryHealthHint;
}

export interface WorkerRestartDeliverySummaryResponse {
  success: true;
  windowStartAt: string;
  windowEndAt: string;
  totalCount: number;
  destinations: WorkerRestartDeliverySummaryRow[];
}

export interface WorkerRestartDeliveryQuery {
  environment?: string;
  destinationName?: string;
  status?: string;
  eventType?: string;
  severity?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
  alertId?: string;
  restartRequestId?: string;
  formatterProfile?: string;
}

export interface WorkerRestartDeliveryTrendWindowSummary {
  windowStartAt: string;
  windowEndAt: string;
  totalCount: number;
  sentCount: number;
  failedCount: number;
  suppressedCount: number;
  skippedCount: number;
  failureRate: number;
  suppressionRate: number;
  healthHint: WorkerRestartDeliveryHealthHint;
  recentEnvironments: string[];
  recentEventTypes: WorkerRestartAlertNotificationEventType[];
  lastActivityAt?: string;
  lastSentAt?: string;
  lastFailedAt?: string;
  lastSuppressedAt?: string;
  lastSkippedAt?: string;
}

export interface WorkerRestartDeliveryTrendRow {
  destinationName: string;
  destinationType?: string;
  sinkType?: string;
  formatterProfile?: string;
  currentWindow: WorkerRestartDeliveryTrendWindowSummary;
  comparisonWindow: WorkerRestartDeliveryTrendWindowSummary;
  currentHealthHint: WorkerRestartDeliveryHealthHint;
  comparisonHealthHint: WorkerRestartDeliveryHealthHint;
  trendHint: WorkerRestartDeliveryTrendHint;
  recentFailureDelta: number;
  recentSuppressionDelta: number;
  recentVolumeDelta: number;
  lastSentAt?: string;
  lastFailedAt?: string;
  summaryText: string;
}

export interface WorkerRestartDeliveryTrendResponse {
  success: true;
  referenceEndAt: string;
  currentWindowStartAt: string;
  comparisonWindowStartAt: string;
  limit: number;
  totalCount: number;
  hasMore: boolean;
  destinations: WorkerRestartDeliveryTrendRow[];
}

export interface WorkerRestartDeliveryTrendQuery {
  environment?: string;
  destinationName?: string;
  eventType?: string;
  severity?: string;
  formatterProfile?: string;
  referenceEndAt?: string;
  limit?: number;
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

export type ControlRecoveryRehearsalStatus = 'passed' | 'failed';
export type ControlRecoveryRehearsalContextKind = 'canonical' | 'staging' | 'disposable' | 'unknown';
export type ControlRecoveryRehearsalExecutionSource = 'manual' | 'automated';
export type ControlRecoveryRehearsalFreshnessStatus = 'healthy' | 'warning' | 'stale' | 'failed' | 'unknown';
export type ControlRecoveryRehearsalAlertReasonCode =
  | 'rehearsal_missing'
  | 'rehearsal_fresh'
  | 'rehearsal_warning_threshold'
  | 'rehearsal_stale'
  | 'rehearsal_failed'
  | 'automated_rehearsal_missing'
  | 'automated_rehearsal_repeated_failure';
export type ControlRecoveryRehearsalAlertSeverity = 'warning' | 'critical';
export type ControlRecoveryRehearsalAlertStatus = 'open' | 'acknowledged' | 'resolved';
export type ControlRecoveryRehearsalAutomationHealth = 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
export type ControlRecoveryRehearsalNotificationEventType =
  | 'freshness_stale_opened'
  | 'freshness_failed_opened'
  | 'freshness_repeated_failure'
  | 'freshness_recovered';
export type ControlRecoveryRehearsalNotificationStatus = 'pending' | 'sent' | 'skipped' | 'suppressed' | 'failed';

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

export interface ControlRecoveryRehearsalExecutionContext {
  orchestration: 'manual_cli' | 'render_cron' | 'control_path' | 'unknown';
  provider?: 'render';
  serviceName?: string;
  schedule?: string;
  trigger?: string;
  runId?: string;
}

export interface ControlRecoveryRehearsalContext {
  label: string;
  kind: ControlRecoveryRehearsalContextKind;
}

export interface ControlRecoveryRehearsalValidation {
  matched: boolean;
  countsMatched: boolean;
  contentMatched: boolean;
  status: 'exact_match' | 'content_mismatch' | 'count_or_metadata_mismatch';
  mismatchTables: string[];
  countMismatchTables: string[];
  metadataMismatches: string[];
  before: { environment: string; capturedAt: string; schemaState: string; counts: Record<string, number>; totalRecords: number };
  after: { environment: string; capturedAt: string; schemaState: string; counts: Record<string, number>; totalRecords: number };
}

export interface ControlRecoveryRehearsalEvidenceRecord {
  id: string;
  environment: string;
  rehearsalKind: 'disposable_restore';
  status: ControlRecoveryRehearsalStatus;
  executionSource: ControlRecoveryRehearsalExecutionSource;
  executionContext: ControlRecoveryRehearsalExecutionContext;
  executedAt: string;
  recordedAt: string;
  actorId: string;
  actorDisplayName: string;
  actorRole: DashboardOperatorRole;
  sessionId: string;
  sourceContext: ControlRecoveryRehearsalContext;
  targetContext: ControlRecoveryRehearsalContext;
  sourceDatabaseFingerprint: string;
  targetDatabaseFingerprint: string;
  sourceSchemaStatus: Record<string, unknown>;
  targetSchemaStatusBefore: Record<string, unknown>;
  targetSchemaStatusAfter?: Record<string, unknown>;
  restoreValidation: ControlRecoveryRehearsalValidation;
  summary: string;
  failureReason?: string;
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
  latestEvidenceStatus?: ControlRecoveryRehearsalStatus;
  latestEvidenceExecutionSource?: ControlRecoveryRehearsalExecutionSource;
  latestAutomatedRunAt?: string;
  latestAutomatedRunStatus?: ControlRecoveryRehearsalStatus;
  latestManualRunAt?: string;
  latestManualRunStatus?: ControlRecoveryRehearsalStatus;
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
  latestEvidenceExecutionSource?: ControlRecoveryRehearsalExecutionSource | 'unknown';
  latestEvidenceStatus?: ControlRecoveryRehearsalStatus | 'unknown';
  latestAutomatedRunAt?: string;
  latestAutomatedRunStatus?: ControlRecoveryRehearsalStatus | 'unknown';
  latestManualRunAt?: string;
  latestManualRunStatus?: ControlRecoveryRehearsalStatus | 'unknown';
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
  databaseRehearsalStatus?: ControlRecoveryRehearsalOperationalStatus;
}

export interface DashboardOperatorSession {
  sessionId: string;
  actorId: string;
  displayName: string;
  role: DashboardOperatorRole;
  issuedAt: string;
  expiresAt: string;
}

export interface DashboardOperatorAuthState {
  configured: boolean;
  authenticated: boolean;
  session?: DashboardOperatorSession;
  identityLabel: string;
  reason?: string;
}

export interface DashboardLoginRequest {
  username: string;
  password: string;
}

export type DashboardLoginResponse = DashboardOperatorAuthState;

export interface DashboardLogoutResponse {
  success: true;
}

export interface LivePromotionGateReason {
  code: string;
  message: string;
  severity: 'blocked' | 'warning';
}

export interface LivePromotionGateResult {
  allowed: boolean;
  targetMode: LivePromotionTargetMode;
  currentMode: string;
  currentRuntimeStatus: string;
  workerHeartbeatAt?: string;
  activeRestartAlertCount: number;
  restartRequired: boolean;
  restartInProgress: boolean;
  killSwitchActive: boolean;
  healthPosture?: string;
  healthReason?: string;
  reasons: LivePromotionGateReason[];
}

export interface LivePromotionRecord {
  id: string;
  environment: string;
  targetMode: LivePromotionTargetMode;
  previousMode: string;
  workflowStatus: LivePromotionWorkflowStatus;
  applicationStatus: LivePromotionApplicationStatus;
  requestReason: string;
  blockedReason?: string;
  approvalReason?: string;
  rollbackReason?: string;
  requestedByActorId: string;
  requestedByDisplayName: string;
  requestedByRole: DashboardOperatorRole;
  requestedBySessionId: string;
  requestedAt: string;
  approvedByActorId?: string;
  approvedByDisplayName?: string;
  approvedByRole?: DashboardOperatorRole;
  approvedBySessionId?: string;
  approvedAt?: string;
  deniedByActorId?: string;
  deniedByDisplayName?: string;
  deniedByRole?: DashboardOperatorRole;
  deniedBySessionId?: string;
  deniedAt?: string;
  appliedByActorId?: string;
  appliedByDisplayName?: string;
  appliedByRole?: DashboardOperatorRole;
  appliedBySessionId?: string;
  appliedAt?: string;
  rolledBackByActorId?: string;
  rolledBackByDisplayName?: string;
  rolledBackByRole?: DashboardOperatorRole;
  rolledBackBySessionId?: string;
  rolledBackAt?: string;
  updatedAt: string;
}

export interface LivePromotionListResponse {
  success: true;
  currentMode: string;
  currentRuntimeStatus: string;
  gate: LivePromotionGateResult;
  requests: LivePromotionRecord[];
}

export interface LivePromotionRequestBody {
  targetMode: LivePromotionTargetMode;
  reason?: string;
}

export interface LivePromotionDecisionBody {
  reason?: string;
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
