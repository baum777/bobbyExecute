import type {
  HealthResponse,
  SummaryResponse,
  AdaptersResponse,
  DecisionsResponse,
  MetricsResponse,
  ControlStatusResponse,
  RestartAlertListResponse,
  RestartWorkerRequest,
  RestartWorkerResponse,
  WorkerRestartAlertRecord,
  WorkerRestartStatus,
} from '@/types/api';

const now = () => new Date().toISOString();
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

export function mockHealth(): HealthResponse {
  return {
    status: 'OK',
    uptimeMs: 86400000 + Math.random() * 3600000,
    version: '0.1.0',
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
  };
}

export function mockAdapters(): AdaptersResponse {
  return {
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
    };
  });
  return { decisions };
}

export function mockMetrics(): MetricsResponse {
  return {
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
    killSwitch: { halted: false },
    liveControl: {
      mode: 'auto',
      liveTestMode: false,
      killSwitchActive: false,
      lastTransitionAt: heartbeat,
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
      eventType: 'alert_opened',
      latestDeliveryStatus: 'sent',
      attemptCount: 1,
      lastAttemptedAt: heartbeat,
      dedupeKey: `notification-${requestId}`,
      payloadFingerprint: `payload-${requestId}`,
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
