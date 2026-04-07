import type {
  HealthResponse,
  SummaryResponse,
  AdaptersResponse,
  DecisionsResponse,
  MetricsResponse,
  ControlStatusResponse,
  DashboardLoginRequest,
  DashboardOperatorAuthState,
  DashboardOperatorRole,
  RestartAlertListResponse,
  WorkerRestartDeliveryJournalResponse,
  WorkerRestartDeliverySummaryResponse,
  WorkerRestartDeliveryTrendQuery,
  WorkerRestartDeliveryTrendResponse,
  WorkerRestartDeliveryTrendRow,
  WorkerRestartDeliveryTrendWindowSummary,
  RestartWorkerRequest,
  RestartWorkerResponse,
  WorkerRestartAlertRecord,
  WorkerRestartAlertNotificationEventType,
  WorkerRestartStatus,
  ControlRecoveryRehearsalOperationalStatus,
  ControlRecoveryRehearsalEvidenceRecord,
  LivePromotionDecisionBody,
  LivePromotionGateResult,
  LivePromotionListResponse,
  LivePromotionRecord,
  LivePromotionRequestBody,
  LivePromotionTargetMode,
} from '@/types/api';

const now = () => new Date().toISOString();
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

export function mockDashboardSession(role: DashboardOperatorRole = 'admin'): DashboardOperatorAuthState {
  const session = {
    sessionId: `session-${role}`,
    actorId: `${role}-operator`,
    displayName: `${role[0].toUpperCase()}${role.slice(1)} Operator`,
    role,
    issuedAt: ago(15 * 60 * 1000),
    expiresAt: ago(-7 * 60 * 60 * 1000),
  };

  return {
    configured: true,
    authenticated: true,
    session,
    identityLabel: `${session.displayName} (${session.role})`,
  };
}

export function mockDashboardLogin(input: DashboardLoginRequest): DashboardOperatorAuthState {
  return mockDashboardSession(input.username.includes('viewer') ? 'viewer' : input.username.includes('ops') ? 'operator' : 'admin');
}

export function mockDashboardLogout() {
  return { success: true as const };
}

export function mockHealth(): HealthResponse {
  return {
    status: 'OK',
    uptimeMs: 86400000 + Math.random() * 3600000,
    version: '0.1.0',
    surfaceKind: 'unwired',
    killSwitch: { halted: false },
  };
}

export function mockSummary(): SummaryResponse {
  return {
    botStatus: 'running',
    riskScore: 0.18 + Math.random() * 0.1,
    chaosPassRate: 0.92 + Math.random() * 0.08,
    dataQuality: 0.85 + Math.random() * 0.15,
    lastDecisionAt: ago(Math.floor(Math.random() * 30000)),
    tradesToday: 37 + Math.floor(Math.random() * 10),
    metricProvenance: {
      riskScore: 'unwired',
      chaosPassRate: 'unwired',
      dataQuality: 'unwired',
      lastDecisionAt: 'unwired',
      tradesToday: 'unwired',
    },
  };
}

export function mockAdapters(): AdaptersResponse {
  return {
    surfaceKind: 'unwired',
    adapters: [
      {
        id: 'dexscreener',
        status: 'healthy',
        latencyMs: 95 + Math.floor(Math.random() * 60),
        lastSuccessAt: ago(2000),
        consecutiveFailures: 0,
      },
      {
        id: 'moralis',
        status: 'healthy',
        latencyMs: 140 + Math.floor(Math.random() * 80),
        lastSuccessAt: ago(3000),
        consecutiveFailures: 0,
      },
      {
        id: 'dexpaprika',
        status: 'degraded',
        latencyMs: 2200 + Math.floor(Math.random() * 500),
        lastSuccessAt: ago(18000),
        consecutiveFailures: 3,
      },
      {
        id: 'jupiter-quotes',
        status: 'healthy',
        latencyMs: 180 + Math.floor(Math.random() * 100),
        lastSuccessAt: ago(5000),
        consecutiveFailures: 0,
      },
      {
        id: 'solana-rpc',
        status: 'healthy',
        latencyMs: 60 + Math.floor(Math.random() * 40),
        lastSuccessAt: ago(1000),
        consecutiveFailures: 0,
      },
      {
        id: 'helius-rpc',
        status: 'down',
        latencyMs: 0,
        lastSuccessAt: ago(300000),
        consecutiveFailures: 12,
      },
    ],
  };
}

const TOKENS = ['SOL', 'BONK', 'WIF', 'JUP', 'PYTH', 'RAY', 'ORCA', 'MNDE'];
const REASONS_POOL = [
  'High liquidity confirmed',
  'Positive momentum detected',
  'Cross-source validation passed',
  'Low confidence score',
  'Risk threshold exceeded',
  'Stale price data',
  'MEV sandwich risk',
  'Pump velocity anomaly',
  'Circuit breaker open',
  'Chaos gate failed',
  'Pattern: steady_gainer',
  'Pattern: quick_runner',
  'Governance policy: max position cap',
  'Daily loss limit approaching',
];

export function mockDecisions(): DecisionsResponse {
  const actions: Array<'allow' | 'block' | 'abort'> = ['allow', 'block', 'abort'];
  const decisions = Array.from({ length: 25 }, (_, i) => {
    const action = actions[Math.floor(Math.random() * 3)];
    const reasonCount = action === 'allow' ? 2 : Math.floor(Math.random() * 3) + 1;
    const reasons: string[] = [];
    for (let r = 0; r < reasonCount; r++) {
      reasons.push(REASONS_POOL[Math.floor(Math.random() * REASONS_POOL.length)]);
    }
    return {
      id: `dec-${1000 + i}`,
      timestamp: ago(i * 45000 + Math.floor(Math.random() * 10000)),
      action,
      token: TOKENS[Math.floor(Math.random() * TOKENS.length)],
      confidence: action === 'allow' ? 0.7 + Math.random() * 0.3 : Math.random() * 0.6,
      reasons,
      provenanceKind: 'legacy_projection' as const,
      source: 'action_log_projection' as const,
    };
  });
  return { decisions };
}

export function mockMetrics(): MetricsResponse {
  return {
    surfaceKind: 'unwired',
    p95LatencyMs: {
      adapter: 120 + Math.floor(Math.random() * 50),
      quote: 75 + Math.floor(Math.random() * 30),
      swap: 190 + Math.floor(Math.random() * 60),
      rpc: 55 + Math.floor(Math.random() * 25),
      chaos: 40 + Math.floor(Math.random() * 20),
    },
  };
}

export function mockControlStatus(): ControlStatusResponse {
  const heartbeat = now();
  const runtimeVersion = `runtime-${Math.floor(Math.random() * 10_000)}`;
  return {
    success: true,
    worker: {
      workerId: 'mock-worker',
      lastHeartbeatAt: heartbeat,
      lastCycleAt: ago(3000),
      lastSeenReloadNonce: 0,
      lastAppliedVersionId: runtimeVersion,
      lastValidVersionId: runtimeVersion,
      degraded: false,
      observedAt: heartbeat,
    },
    runtimeConfig: {
      requestedMode: 'observe',
      appliedMode: 'observe',
      requestedVersionId: runtimeVersion,
      appliedVersionId: runtimeVersion,
      lastValidVersionId: runtimeVersion,
      pendingApply: false,
      requiresRestart: false,
      pendingReason: undefined,
      reloadNonce: 0,
      paused: false,
      killSwitch: false,
      degraded: false,
    },
    controlView: {
      requestedMode: 'observe',
      appliedMode: 'observe',
      requestedVersionId: runtimeVersion,
      appliedVersionId: runtimeVersion,
      pendingApply: false,
      requiresRestart: false,
      paused: false,
      killSwitch: false,
      degraded: false,
    },
    restart: {
      required: false,
      requested: false,
      inProgress: false,
      pendingVersionId: undefined,
      restartRequiredReason: undefined,
      lastHeartbeatAt: heartbeat,
      lastAppliedVersionId: runtimeVersion,
    },
    restartAlerts: {
      environment: 'mock',
      workerService: 'mock-runtime-worker',
      latestRestartRequestStatus: 'converged',
      lastSuccessfulRestartConvergenceAt: ago(60000),
      openAlertCount: 0,
      acknowledgedAlertCount: 0,
      resolvedAlertCount: 0,
      activeAlertCount: 0,
      stalledRestartCount: 0,
      highestOpenSeverity: undefined,
      divergenceAlerting: false,
      openSourceCategories: [],
      externalNotificationCount: 1,
      notificationFailureCount: 0,
      notificationSuppressedCount: 0,
      latestNotificationStatus: 'sent',
      latestNotificationAt: heartbeat,
      latestNotificationFailureReason: undefined,
      latestNotificationSuppressionReason: undefined,
      lastEvaluatedAt: heartbeat,
    },
    databaseRehearsalStatus: {
      environment: 'mock',
      freshnessStatus: 'healthy',
      blockedByFreshness: false,
      freshnessWindowMs: 7 * 24 * 60 * 60 * 1000,
      warningThresholdMs: Math.floor((7 * 24 * 60 * 60 * 1000) * 0.8),
      freshnessAgeMs: 2 * 60 * 60 * 1000,
      lastSuccessfulRehearsalAt: ago(2 * 60 * 60 * 1000),
      lastFailedRehearsalAt: undefined,
      latestEvidence: {
        id: `rehearsal-${runtimeVersion}`,
        environment: 'mock',
        rehearsalKind: 'disposable_restore',
        status: 'passed',
        executionSource: 'automated',
        executionContext: {
          orchestration: 'render_cron',
          provider: 'render',
          serviceName: 'mock-rehearsal-refresh',
          schedule: '0 3 * * *',
          trigger: 'scheduled_refresh',
        },
        executedAt: ago(2 * 60 * 60 * 1000),
        recordedAt: ago(2 * 60 * 60 * 1000),
        actorId: 'render-rehearsal-refresh',
        actorDisplayName: 'Render rehearsal refresh',
        actorRole: 'admin',
        sessionId: `render:${runtimeVersion}`,
        sourceContext: { label: 'canonical-mock', kind: 'canonical' },
        targetContext: { label: 'disposable-mock', kind: 'disposable' },
        sourceDatabaseFingerprint: 'source-fingerprint',
        targetDatabaseFingerprint: 'target-fingerprint',
        sourceSchemaStatus: {},
        targetSchemaStatusBefore: {},
        targetSchemaStatusAfter: {},
        restoreValidation: {
          matched: true,
          countsMatched: true,
          contentMatched: true,
          status: 'exact_match',
          mismatchTables: [],
          countMismatchTables: [],
          metadataMismatches: [],
          before: {
            environment: 'mock',
            capturedAt: ago(2 * 60 * 60 * 1000),
            schemaState: 'ready',
            counts: {},
            totalRecords: 0,
          },
          after: {
            environment: 'mock',
            capturedAt: ago(2 * 60 * 60 * 1000),
            schemaState: 'ready',
            counts: {},
            totalRecords: 0,
          },
        },
        summary: 'Mock automated rehearsal passed',
      } satisfies ControlRecoveryRehearsalEvidenceRecord,
      latestEvidenceExecutionSource: 'automated',
      latestEvidenceStatus: 'passed',
      latestAutomatedRunAt: ago(2 * 60 * 60 * 1000),
      latestAutomatedRunStatus: 'passed',
      latestManualRunAt: undefined,
      latestManualRunStatus: undefined,
      repeatedAutomationFailureCount: 0,
      automationHealth: 'healthy',
      manualFallbackActive: false,
      notification: {
        externallyNotified: true,
        sinkName: 'rehearsal-freshness-webhook',
        sinkType: 'generic_webhook',
        latestDestinationName: 'primary',
        latestDestinationType: 'primary',
        latestFormatterProfile: 'generic',
        eventType: 'freshness_recovered',
        latestDeliveryStatus: 'sent',
        attemptCount: 2,
        lastAttemptedAt: ago(2 * 60 * 60 * 1000),
        dedupeKey: 'rehearsal-freshness:primary:freshness_recovered:payload',
        payloadFingerprint: 'rehearsal-freshness-payload',
        recoveryNotificationSent: true,
        recoveryNotificationAt: ago(2 * 60 * 60 * 1000),
        selectedDestinationCount: 2,
        selectedDestinationNames: ['primary', 'secondary'],
        destinations: [
          {
            name: 'primary',
            sinkType: 'generic_webhook',
            formatterProfile: 'generic',
            priority: 10,
            selected: true,
            latestDeliveryStatus: 'sent',
            attemptCount: 2,
            lastAttemptedAt: ago(2 * 60 * 60 * 1000),
            dedupeKey: 'rehearsal-freshness:primary:freshness_recovered:payload',
            payloadFingerprint: 'rehearsal-freshness-payload',
            recoveryNotificationSent: true,
            recoveryNotificationAt: ago(2 * 60 * 60 * 1000),
          },
          {
            name: 'secondary',
            sinkType: 'generic_webhook',
            formatterProfile: 'slack',
            priority: 20,
            selected: true,
            latestDeliveryStatus: 'skipped',
            attemptCount: 1,
            lastAttemptedAt: ago(3 * 60 * 60 * 1000),
            suppressionReason: 'warning alerts are local-only by default',
            routeReason: 'destination selected by routing policy',
            dedupeKey: 'rehearsal-freshness:secondary:freshness_recovered:payload',
            payloadFingerprint: 'rehearsal-freshness-payload',
            recoveryNotificationSent: false,
          },
        ],
      },
      reasonCode: 'rehearsal_fresh',
      severity: 'warning',
      statusMessage: 'The latest successful rehearsal is fresh.',
      alert: {
        id: `rehearsal-alert-${runtimeVersion}`,
        environment: 'mock',
        reasonCode: 'rehearsal_fresh',
        severity: 'warning',
        status: 'resolved',
        summary: 'Mock automated rehearsal remains fresh',
        recommendedAction: 'Keep the Render rehearsal refresh cadence running',
        freshnessStatus: 'healthy',
        blockedByFreshness: false,
        freshnessWindowMs: 7 * 24 * 60 * 60 * 1000,
        warningThresholdMs: Math.floor((7 * 24 * 60 * 60 * 1000) * 0.8),
        freshnessAgeMs: 2 * 60 * 60 * 1000,
        lastSuccessfulRehearsalAt: ago(2 * 60 * 60 * 1000),
        lastFailedRehearsalAt: undefined,
        latestEvidenceId: `rehearsal-${runtimeVersion}`,
        latestEvidenceExecutedAt: ago(2 * 60 * 60 * 1000),
        latestEvidenceStatus: 'passed',
        latestEvidenceExecutionSource: 'automated',
        latestAutomatedRunAt: ago(2 * 60 * 60 * 1000),
        latestAutomatedRunStatus: 'passed',
        latestManualRunAt: undefined,
        latestManualRunStatus: undefined,
        repeatedAutomationFailureCount: 0,
        automationHealth: 'healthy',
        manualFallbackActive: false,
        notification: {
          externallyNotified: true,
          sinkName: 'rehearsal-freshness-webhook',
          sinkType: 'generic_webhook',
          latestDestinationName: 'primary',
          latestDestinationType: 'primary',
          latestFormatterProfile: 'generic',
          eventType: 'freshness_recovered',
          latestDeliveryStatus: 'sent',
          attemptCount: 2,
          lastAttemptedAt: ago(2 * 60 * 60 * 1000),
          dedupeKey: 'rehearsal-freshness:primary:freshness_recovered:payload',
          payloadFingerprint: 'rehearsal-freshness-payload',
          recoveryNotificationSent: true,
          recoveryNotificationAt: ago(2 * 60 * 60 * 1000),
          selectedDestinationCount: 2,
          selectedDestinationNames: ['primary', 'secondary'],
          destinations: [
            {
              name: 'primary',
              sinkType: 'generic_webhook',
              formatterProfile: 'generic',
              priority: 10,
              selected: true,
              latestDeliveryStatus: 'sent',
              attemptCount: 2,
              lastAttemptedAt: ago(2 * 60 * 60 * 1000),
              dedupeKey: 'rehearsal-freshness:primary:freshness_recovered:payload',
              payloadFingerprint: 'rehearsal-freshness-payload',
              recoveryNotificationSent: true,
              recoveryNotificationAt: ago(2 * 60 * 60 * 1000),
            },
            {
              name: 'secondary',
              sinkType: 'generic_webhook',
              formatterProfile: 'slack',
              priority: 20,
              selected: true,
              latestDeliveryStatus: 'skipped',
              attemptCount: 1,
              lastAttemptedAt: ago(3 * 60 * 60 * 1000),
              suppressionReason: 'warning alerts are local-only by default',
              routeReason: 'destination selected by routing policy',
              dedupeKey: 'rehearsal-freshness:secondary:freshness_recovered:payload',
              payloadFingerprint: 'rehearsal-freshness-payload',
              recoveryNotificationSent: false,
            },
          ],
        },
        firstSeenAt: ago(2 * 60 * 60 * 1000),
        lastSeenAt: ago(2 * 60 * 60 * 1000),
        lastEvaluatedAt: heartbeat,
        resolvedAt: ago(90 * 60 * 1000),
        resolvedBy: 'system',
        resolutionNote: 'fresh rehearsal evidence restored',
        createdAt: ago(2 * 60 * 60 * 1000),
        updatedAt: heartbeat,
      },
      hasOpenAlert: false,
      lastEvaluatedAt: heartbeat,
    } satisfies ControlRecoveryRehearsalOperationalStatus,
    killSwitch: { halted: false },
    liveControl: {
      mode: 'auto',
      liveTestMode: false,
      killSwitchActive: false,
      lastTransitionAt: heartbeat,
    },
  };
}

function buildLivePromotionGate(targetMode: LivePromotionTargetMode): LivePromotionGateResult {
  return {
    allowed: true,
    targetMode,
    currentMode: 'paper',
    currentRuntimeStatus: 'running',
    workerHeartbeatAt: heartbeatTimestamp(),
    activeRestartAlertCount: 0,
    restartRequired: false,
    restartInProgress: false,
    killSwitchActive: false,
    healthPosture: 'healthy_for_posture',
    healthReason: undefined,
    reasons: [],
  };
}

function heartbeatTimestamp(): string {
  return now();
}

function buildLivePromotionRecord(targetMode: LivePromotionTargetMode, status: LivePromotionRecord['workflowStatus']): LivePromotionRecord {
  const timestamp = now();
  const session = mockDashboardSession('admin').session!;
  return {
    id: `promotion-${targetMode}-${status}`,
    environment: 'mock',
    targetMode,
    previousMode: 'paper',
    workflowStatus: status,
    applicationStatus: status === 'applied' ? 'pending_restart' : status === 'rolled_back' ? 'rolled_back' : 'pending_restart',
    requestReason: `mock ${targetMode} promotion`,
    requestedByActorId: session.actorId,
    requestedByDisplayName: session.displayName,
    requestedByRole: session.role,
    requestedBySessionId: session.sessionId,
    requestedAt: timestamp,
    blockedReason: status === 'blocked' ? 'mock blocked' : undefined,
    approvalReason: status === 'approved' ? 'mock approved' : undefined,
    rollbackReason: status === 'rolled_back' ? 'mock rollback' : undefined,
    approvedByActorId: status === 'approved' || status === 'applied' || status === 'rolled_back' ? session.actorId : undefined,
    approvedByDisplayName: status === 'approved' || status === 'applied' || status === 'rolled_back' ? session.displayName : undefined,
    approvedByRole: status === 'approved' || status === 'applied' || status === 'rolled_back' ? session.role : undefined,
    approvedBySessionId: status === 'approved' || status === 'applied' || status === 'rolled_back' ? session.sessionId : undefined,
    approvedAt: status === 'approved' || status === 'applied' || status === 'rolled_back' ? timestamp : undefined,
    deniedByActorId: status === 'denied' ? session.actorId : undefined,
    deniedByDisplayName: status === 'denied' ? session.displayName : undefined,
    deniedByRole: status === 'denied' ? session.role : undefined,
    deniedBySessionId: status === 'denied' ? session.sessionId : undefined,
    deniedAt: status === 'denied' ? timestamp : undefined,
    appliedByActorId: status === 'applied' ? session.actorId : undefined,
    appliedByDisplayName: status === 'applied' ? session.displayName : undefined,
    appliedByRole: status === 'applied' ? session.role : undefined,
    appliedBySessionId: status === 'applied' ? session.sessionId : undefined,
    appliedAt: status === 'applied' ? timestamp : undefined,
    rolledBackByActorId: status === 'rolled_back' ? session.actorId : undefined,
    rolledBackByDisplayName: status === 'rolled_back' ? session.displayName : undefined,
    rolledBackByRole: status === 'rolled_back' ? session.role : undefined,
    rolledBackBySessionId: status === 'rolled_back' ? session.sessionId : undefined,
    rolledBackAt: status === 'rolled_back' ? timestamp : undefined,
    updatedAt: timestamp,
  };
}

export function mockLivePromotions(input: { targetMode?: LivePromotionTargetMode } = {}): LivePromotionListResponse {
  const gate = buildLivePromotionGate(input.targetMode ?? 'live');
  return {
    success: true,
    currentMode: 'paper',
    currentRuntimeStatus: 'running',
    gate,
    requests: [
      buildLivePromotionRecord(input.targetMode === 'live' ? 'live' : 'live_limited', 'pending'),
      buildLivePromotionRecord('live', 'blocked'),
    ],
  };
}

export function mockRequestLivePromotion(input: LivePromotionRequestBody): { success: true; request: LivePromotionRecord } {
  return {
    success: true,
    request: buildLivePromotionRecord(input.targetMode, 'pending'),
  };
}

export function mockApproveLivePromotion(id: string, input: LivePromotionDecisionBody = {}) {
  const targetMode = id.includes('live_limited') ? 'live_limited' : 'live';
  return {
    success: true as const,
    request: {
      ...buildLivePromotionRecord(targetMode, 'approved'),
      approvalReason: input.reason ?? 'mock approved',
    },
  };
}

export function mockDenyLivePromotion(id: string, input: LivePromotionDecisionBody = {}) {
  const targetMode = id.includes('live_limited') ? 'live_limited' : 'live';
  return {
    success: true as const,
    request: {
      ...buildLivePromotionRecord(targetMode, 'denied'),
      blockedReason: input.reason ?? 'mock denied',
    },
  };
}

export function mockApplyLivePromotion(id: string, input: LivePromotionDecisionBody = {}) {
  const targetMode = id.includes('live_limited') ? 'live_limited' : 'live';
  return {
    success: true as const,
    request: {
      ...buildLivePromotionRecord(targetMode, 'applied'),
      approvalReason: input.reason ?? 'mock applied',
    },
  };
}

export function mockRollbackLivePromotion(id: string, input: LivePromotionDecisionBody = {}) {
  const targetMode = id.includes('live_limited') ? 'live_limited' : 'live';
  return {
    success: true as const,
    request: {
      ...buildLivePromotionRecord(targetMode, 'rolled_back'),
      rollbackReason: input.reason ?? 'mock rolled back',
    },
  };
}

export function mockRestartAlerts(): RestartAlertListResponse {
  const heartbeat = now();
  const requestId = `restart-${Math.floor(Math.random() * 10_000)}`;
  const alert: WorkerRestartAlertRecord = {
    id: `alert-${Math.floor(Math.random() * 10_000)}`,
    environment: 'mock',
    dedupeKey: `request:${requestId}`,
    restartRequestId: requestId,
    workerService: 'mock-runtime-worker',
    targetWorker: 'mock-runtime-worker',
    targetVersionId: `runtime-${Math.floor(Math.random() * 10_000)}`,
    sourceCategory: 'restart_timeout',
    reasonCode: 'restart_timeout',
    severity: 'warning',
    status: 'open',
    summary: 'Mock restart alert',
    recommendedAction: 'Inspect worker convergence',
    metadata: {
      requestedAt: ago(120000),
    },
    conditionSignature: `mock-${requestId}`,
    occurrenceCount: 1,
    firstSeenAt: ago(120000),
    lastSeenAt: heartbeat,
    lastEvaluatedAt: heartbeat,
    lastRestartRequestStatus: 'requested',
    lastRestartRequestUpdatedAt: ago(120000),
    lastWorkerHeartbeatAt: ago(110000),
    lastAppliedVersionId: `runtime-${Math.floor(Math.random() * 10_000)}`,
    requestedVersionId: `runtime-${Math.floor(Math.random() * 10_000)}`,
    notification: {
      externallyNotified: true,
      sinkName: 'restart-alert-webhook',
      sinkType: 'generic_webhook',
      latestDestinationName: 'primary',
      latestDestinationType: 'primary',
      latestFormatterProfile: 'generic',
      eventType: 'alert_opened',
      latestDeliveryStatus: 'sent',
      attemptCount: 1,
      lastAttemptedAt: heartbeat,
      dedupeKey: `notification-${requestId}`,
      payloadFingerprint: `payload-${requestId}`,
      resolutionNotificationSent: false,
      resolutionNotificationAt: undefined,
      selectedDestinationCount: 1,
      selectedDestinationNames: ['primary'],
      destinations: [
        {
          name: 'primary',
          sinkType: 'generic_webhook',
          formatterProfile: 'generic',
          priority: 10,
          selected: true,
          latestDeliveryStatus: 'sent',
          attemptCount: 1,
          lastAttemptedAt: heartbeat,
          dedupeKey: `notification-${requestId}`,
          payloadFingerprint: `payload-${requestId}`,
          recoveryNotificationSent: false,
        },
      ],
    },
    createdAt: ago(120000),
    updatedAt: heartbeat,
  };

  return {
    success: true,
    summary: {
      environment: 'mock',
      workerService: 'mock-runtime-worker',
      latestRestartRequestStatus: 'requested',
      lastSuccessfulRestartConvergenceAt: ago(60000),
      openAlertCount: 1,
      acknowledgedAlertCount: 0,
      resolvedAlertCount: 0,
      activeAlertCount: 1,
      stalledRestartCount: 1,
      highestOpenSeverity: 'warning',
      divergenceAlerting: true,
      openSourceCategories: ['restart_timeout'],
      externalNotificationCount: 1,
      notificationFailureCount: 0,
      notificationSuppressedCount: 0,
      latestNotificationStatus: 'sent',
      latestNotificationAt: heartbeat,
      latestNotificationFailureReason: undefined,
      latestNotificationSuppressionReason: undefined,
      lastEvaluatedAt: heartbeat,
    },
    alerts: [alert],
  };
}

type DeliveryMockQuery = {
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
};

function buildMockDeliveryRows(): WorkerRestartDeliveryJournalResponse['deliveries'] {
  const base = now();
  return [
    {
      eventId: 'event-primary-sent',
      alertId: 'alert-primary',
      restartRequestId: 'restart-primary',
      environment: 'production',
      destinationName: 'primary',
      destinationType: 'primary',
      sinkType: 'generic_webhook',
      formatterProfile: 'generic',
      eventType: 'alert_opened',
      deliveryStatus: 'sent',
      severity: 'critical',
      alertStatus: 'open',
      sourceCategory: 'convergence_timeout',
      routeReason: 'destination selected by routing policy',
      dedupeKey: 'dedupe-primary-sent',
      attemptedAt: base,
      attemptCount: 1,
      summary: 'Primary destination received the alert',
    },
    {
      eventId: 'event-secondary-failed',
      alertId: 'alert-secondary',
      restartRequestId: 'restart-secondary',
      environment: 'production',
      destinationName: 'secondary',
      destinationType: 'secondary',
      sinkType: 'generic_webhook',
      formatterProfile: 'slack',
      eventType: 'alert_escalated',
      deliveryStatus: 'failed',
      severity: 'critical',
      alertStatus: 'open',
      sourceCategory: 'repeated_restart_failures',
      routeReason: 'destination selected by routing policy',
      dedupeKey: 'dedupe-secondary-failed',
      payloadFingerprint: 'payload-secondary',
      attemptedAt: ago(60_000),
      attemptCount: 2,
      failureReason: 'webhook responded with 503',
      summary: 'Secondary destination failed',
    },
    {
      eventId: 'event-staging-suppressed',
      alertId: 'alert-staging',
      restartRequestId: 'restart-staging',
      environment: 'staging',
      destinationName: 'staging',
      destinationType: 'staging',
      sinkType: 'generic_webhook',
      formatterProfile: 'generic',
      eventType: 'alert_resolved',
      deliveryStatus: 'suppressed',
      severity: 'warning',
      alertStatus: 'resolved',
      sourceCategory: 'restart_timeout',
      routeReason: 'cooldown active for staging',
      dedupeKey: 'dedupe-staging-suppressed',
      attemptedAt: ago(120_000),
      attemptCount: 1,
      suppressionReason: 'cooldown active for staging',
      summary: 'Staging destination suppressed',
    },
  ];
}

function matchesDeliveryMockQuery(row: WorkerRestartDeliveryJournalResponse['deliveries'][number], query: DeliveryMockQuery): boolean {
  if (query.environment && row.environment !== query.environment) return false;
  if (query.destinationName && row.destinationName !== query.destinationName) return false;
  if (query.status && row.deliveryStatus !== query.status) return false;
  if (query.eventType && row.eventType !== query.eventType) return false;
  if (query.severity && row.severity !== query.severity) return false;
  if (query.alertId && row.alertId !== query.alertId) return false;
  if (query.restartRequestId && row.restartRequestId !== query.restartRequestId) return false;
  if (query.formatterProfile && row.formatterProfile !== query.formatterProfile) return false;
  if (query.from && Date.parse(row.attemptedAt) < Date.parse(query.from)) return false;
  if (query.to && Date.parse(row.attemptedAt) > Date.parse(query.to)) return false;
  return true;
}

function buildMockDeliverySummary(rows: WorkerRestartDeliveryJournalResponse['deliveries']): WorkerRestartDeliverySummaryResponse {
  const byDestination = new Map<string, WorkerRestartDeliverySummaryResponse['destinations'][number]>();
  for (const row of rows) {
    const key = row.destinationName ?? 'unknown';
    const current = byDestination.get(key) ?? {
      destinationName: key,
      destinationType: row.destinationType,
      sinkType: row.sinkType,
      formatterProfile: row.formatterProfile,
      totalCount: 0,
      sentCount: 0,
      failedCount: 0,
      suppressedCount: 0,
      skippedCount: 0,
      openAlertCount: row.alertStatus !== 'resolved' ? 1 : 0,
      recentEnvironments: [],
      recentEventTypes: [],
      healthHint: 'idle',
    };
    current.totalCount += 1;
    if (row.deliveryStatus === 'sent') current.sentCount += 1;
    if (row.deliveryStatus === 'failed') current.failedCount += 1;
    if (row.deliveryStatus === 'suppressed') current.suppressedCount += 1;
    if (row.deliveryStatus === 'skipped') current.skippedCount += 1;
    current.lastActivityAt = row.attemptedAt;
    if (row.deliveryStatus === 'sent') current.lastSentAt = row.attemptedAt;
    if (row.deliveryStatus === 'failed') {
      current.lastFailedAt = row.attemptedAt;
      current.lastFailureReason = row.failureReason;
    }
    if (row.deliveryStatus === 'suppressed') current.lastSuppressedAt = row.attemptedAt;
    if (row.deliveryStatus === 'skipped') current.lastSkippedAt = row.attemptedAt;
    current.latestRouteReason = row.routeReason;
    if (!current.recentEnvironments.includes(row.environment)) current.recentEnvironments.push(row.environment);
    if (row.eventType && !current.recentEventTypes.includes(row.eventType)) current.recentEventTypes.push(row.eventType);
    current.healthHint =
      current.failedCount > 0 && current.sentCount === 0
        ? 'failing'
        : current.failedCount > 0 && current.sentCount > 0
          ? 'degraded'
          : current.sentCount > 0
            ? 'healthy'
            : 'idle';
    byDestination.set(key, current);
  }

  return {
    success: true,
    windowStartAt: ago(24 * 60 * 60 * 1000),
    windowEndAt: now(),
    totalCount: rows.length,
    destinations: [...byDestination.values()],
  };
}

export function mockRestartAlertDeliveries(query: DeliveryMockQuery = {}): WorkerRestartDeliveryJournalResponse {
  const rows = buildMockDeliveryRows().filter((row) => matchesDeliveryMockQuery(row, query)).sort((left, right) => Date.parse(right.attemptedAt) - Date.parse(left.attemptedAt));
  const limit = query.limit ?? 50;
  const offset = query.offset ?? 0;
  const paged = rows.slice(offset, offset + limit);
  return {
    success: true,
    windowStartAt: query.from ?? ago(7 * 24 * 60 * 60 * 1000),
    windowEndAt: query.to ?? now(),
    limit,
    offset,
    totalCount: rows.length,
    hasMore: offset + limit < rows.length,
    deliveries: paged,
  };
}

export function mockRestartAlertDeliverySummary(query: DeliveryMockQuery = {}): WorkerRestartDeliverySummaryResponse {
  const rows = buildMockDeliveryRows().filter((row) => matchesDeliveryMockQuery(row, query)).sort((left, right) => Date.parse(right.attemptedAt) - Date.parse(left.attemptedAt));
  const summary = buildMockDeliverySummary(rows);
  return {
    ...summary,
    windowStartAt: query.from ?? ago(24 * 60 * 60 * 1000),
    windowEndAt: query.to ?? now(),
  };
}

function buildMockTrendWindowSummary(
  windowStartAt: string,
  windowEndAt: string,
  counts: Pick<WorkerRestartDeliveryTrendWindowSummary, 'totalCount' | 'sentCount' | 'failedCount' | 'suppressedCount' | 'skippedCount'>,
  recentEnvironments: string[],
  recentEventTypes: WorkerRestartDeliveryTrendWindowSummary['recentEventTypes'],
  healthHint: WorkerRestartDeliveryTrendWindowSummary['healthHint'],
  lastActivityAt?: string,
  lastSentAt?: string,
  lastFailedAt?: string,
  lastSuppressedAt?: string,
  lastSkippedAt?: string
): WorkerRestartDeliveryTrendWindowSummary {
  const failureRate = counts.totalCount > 0 ? counts.failedCount / counts.totalCount : 0;
  const suppressionRate = counts.totalCount > 0 ? counts.suppressedCount / counts.totalCount : 0;
  return {
    windowStartAt,
    windowEndAt,
    ...counts,
    failureRate,
    suppressionRate,
    healthHint,
    recentEnvironments,
    recentEventTypes,
    lastActivityAt,
    lastSentAt,
    lastFailedAt,
    lastSuppressedAt,
    lastSkippedAt,
  };
}

function buildMockTrendRows(referenceEndAt: string): WorkerRestartDeliveryTrendRow[] {
  const currentWindowStartAt = new Date(Date.parse(referenceEndAt) - 24 * 60 * 60 * 1000).toISOString();
  const comparisonWindowStartAt = new Date(Date.parse(referenceEndAt) - 7 * 24 * 60 * 60 * 1000).toISOString();

  return [
    {
      destinationName: 'primary',
      destinationType: 'primary',
      sinkType: 'generic_webhook',
      formatterProfile: 'generic',
      currentWindow: buildMockTrendWindowSummary(
        currentWindowStartAt,
        referenceEndAt,
        { totalCount: 13, sentCount: 12, failedCount: 1, suppressedCount: 0, skippedCount: 0 },
        ['production'],
        ['alert_opened'],
        'healthy',
        ago(3_600_000),
        ago(3_600_000),
        ago(2 * 3_600_000)
      ),
      comparisonWindow: buildMockTrendWindowSummary(
        comparisonWindowStartAt,
        referenceEndAt,
        { totalCount: 78, sentCount: 72, failedCount: 4, suppressedCount: 1, skippedCount: 1 },
        ['production'],
        ['alert_opened', 'alert_escalated'],
        'healthy',
        ago(3_600_000),
        ago(3_600_000),
        ago(2 * 3_600_000),
        ago(4 * 3_600_000),
        ago(5 * 3_600_000)
      ),
      currentHealthHint: 'healthy',
      comparisonHealthHint: 'healthy',
      trendHint: 'stable',
      recentFailureDelta: 0,
      recentSuppressionDelta: 0,
      recentVolumeDelta: 2,
      lastSentAt: ago(3_600_000),
      lastFailedAt: ago(2 * 3_600_000),
      summaryText: 'Delivery behavior is stable: 24h activity stays close to the 7d baseline.',
    },
    {
      destinationName: 'secondary',
      destinationType: 'secondary',
      sinkType: 'generic_webhook',
      formatterProfile: 'slack',
      currentWindow: buildMockTrendWindowSummary(
        currentWindowStartAt,
        referenceEndAt,
        { totalCount: 5, sentCount: 1, failedCount: 4, suppressedCount: 0, skippedCount: 0 },
        ['production'],
        ['alert_escalated'],
        'failing',
        ago(30 * 60 * 1000),
        ago(45 * 60 * 1000),
        ago(15 * 60 * 1000)
      ),
      comparisonWindow: buildMockTrendWindowSummary(
        comparisonWindowStartAt,
        referenceEndAt,
        { totalCount: 28, sentCount: 18, failedCount: 5, suppressedCount: 2, skippedCount: 3 },
        ['production'],
        ['alert_opened', 'alert_escalated', 'alert_repeated_failure_summary'],
        'degraded',
        ago(30 * 60 * 1000),
        ago(45 * 60 * 1000),
        ago(15 * 60 * 1000),
        ago(5 * 60 * 1000),
        ago(90 * 60 * 1000)
      ),
      currentHealthHint: 'failing',
      comparisonHealthHint: 'degraded',
      trendHint: 'worsening',
      recentFailureDelta: 3,
      recentSuppressionDelta: -1,
      recentVolumeDelta: 1,
      lastSentAt: ago(30 * 60 * 1000),
      lastFailedAt: ago(15 * 60 * 1000),
      summaryText: 'Delivery behavior is worsening: +3 failure delta, -1 suppression delta, health degraded -> failing.',
    },
    {
      destinationName: 'staging',
      destinationType: 'staging',
      sinkType: 'generic_webhook',
      formatterProfile: 'generic',
      currentWindow: buildMockTrendWindowSummary(
        currentWindowStartAt,
        referenceEndAt,
        { totalCount: 0, sentCount: 0, failedCount: 0, suppressedCount: 0, skippedCount: 0 },
        [],
        [],
        'idle'
      ),
      comparisonWindow: buildMockTrendWindowSummary(
        comparisonWindowStartAt,
        referenceEndAt,
        { totalCount: 6, sentCount: 4, failedCount: 0, suppressedCount: 1, skippedCount: 1 },
        ['staging'],
        ['alert_opened', 'alert_resolved'],
        'healthy',
        ago(2 * 24 * 60 * 60 * 1000),
        ago(2 * 24 * 60 * 60 * 1000),
        undefined,
        ago(3 * 24 * 60 * 60 * 1000),
        ago(4 * 24 * 60 * 60 * 1000)
      ),
      currentHealthHint: 'idle',
      comparisonHealthHint: 'healthy',
      trendHint: 'inactive',
      recentFailureDelta: 0,
      recentSuppressionDelta: 0,
      recentVolumeDelta: -1,
      lastSentAt: ago(2 * 24 * 60 * 60 * 1000),
      lastFailedAt: undefined,
      summaryText: 'No delivery activity in the last 24h after 6 events across 7d.',
    },
  ];
}

export function mockRestartAlertDeliveryTrends(query: WorkerRestartDeliveryTrendQuery = {}): WorkerRestartDeliveryTrendResponse {
  const referenceEndAt = query.referenceEndAt ?? now();
  const rows = buildMockTrendRows(referenceEndAt).filter((row) => {
    if (query.environment && !row.currentWindow.recentEnvironments.includes(query.environment) && !row.comparisonWindow.recentEnvironments.includes(query.environment)) {
      return false;
    }
    if (query.destinationName && row.destinationName !== query.destinationName) {
      return false;
    }
    if (query.formatterProfile && row.formatterProfile !== query.formatterProfile) {
      return false;
    }
    if (
      query.eventType &&
      !row.currentWindow.recentEventTypes.includes(query.eventType as WorkerRestartAlertNotificationEventType) &&
      !row.comparisonWindow.recentEventTypes.includes(query.eventType as WorkerRestartAlertNotificationEventType)
    ) {
      return false;
    }
    if (query.severity) {
      const severityBucket = row.currentHealthHint === 'failing' || row.comparisonHealthHint === 'failing'
        ? 'critical'
        : row.currentHealthHint === 'degraded' || row.comparisonHealthHint === 'degraded'
          ? 'warning'
          : 'info';
      if (severityBucket !== query.severity) {
        return false;
      }
    }
    return true;
  });
  const limit = query.limit ?? 50;
  const currentWindowStartAt = new Date(Date.parse(referenceEndAt) - 24 * 60 * 60 * 1000).toISOString();
  const comparisonWindowStartAt = new Date(Date.parse(referenceEndAt) - 7 * 24 * 60 * 60 * 1000).toISOString();
  return {
    success: true,
    referenceEndAt,
    currentWindowStartAt,
    comparisonWindowStartAt,
    limit,
    totalCount: rows.length,
    hasMore: rows.length > limit,
    destinations: rows.slice(0, limit),
  };
}

export function mockRestartWorker(input: RestartWorkerRequest = {}): RestartWorkerResponse {
  const status = mockControlStatus();
  const requestId = `restart-${Math.floor(Math.random() * 10_000)}`;
  const requestedAt = now();
  const targetVersionId = status.runtimeConfig?.requestedVersionId ?? `runtime-${Math.floor(Math.random() * 10_000)}`;
  const restart: WorkerRestartStatus = {
    ...status.restart,
    required: true,
    requested: true,
    inProgress: true,
    pendingVersionId: targetVersionId,
    restartRequiredReason: input.reason ?? 'mock restart requested',
    requestId,
    requestedAt,
    requestedBy: 'dashboard',
    lastOutcome: 'dispatched',
    lastOutcomeAt: requestedAt,
    lastOutcomeReason: 'mock deploy hook accepted',
    method: 'deploy_hook',
    targetService: 'mock-runtime-worker',
    targetWorker: 'mock-worker',
    convergenceObservedAt: undefined,
    clearedAt: undefined,
    lastHeartbeatAt: status.worker?.lastHeartbeatAt,
    lastAppliedVersionId: status.worker?.lastAppliedVersionId,
    deadlineAt: new Date(Date.parse(requestedAt) + 10 * 60 * 1000).toISOString(),
  };

  return {
    ...status,
    accepted: true,
    message: 'worker restart request accepted',
    reason: input.reason,
    targetService: restart.targetService ?? 'mock-runtime-worker',
    targetVersionId,
    orchestrationMethod: 'deploy_hook',
    restart,
  };
}
