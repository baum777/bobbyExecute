import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  useControlStatus: vi.fn(),
  useLivePromotions: vi.fn(),
  useRestartAlerts: vi.fn(),
  useRestartAlertDeliveries: vi.fn(),
  useRestartAlertDeliverySummary: vi.fn(),
  useRestartAlertDeliveryTrends: vi.fn(),
  useAdapters: vi.fn(),
}));

vi.mock('@/hooks/use-control', () => mocks);
vi.mock('@/hooks/use-adapters', () => ({ useAdapters: mocks.useAdapters }));

import { RecoveryPage } from './recovery-page';

function queryResult(data: unknown) {
  return { data, isLoading: false, error: null, refetch: vi.fn() };
}

describe('RecoveryPage', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('makes release and recovery evidence explicit', () => {
    mocks.useControlStatus.mockReturnValue(queryResult({
      killSwitch: { halted: true, reason: 'Manual halt' },
      restart: { required: true, requested: false, inProgress: false, pendingVersionId: 'runtime-2' },
      databaseRehearsalStatus: {
        freshnessStatus: 'warning',
        blockedByFreshness: true,
        statusMessage: 'Freshness is approaching threshold.',
        freshnessAgeMs: 5_000,
        lastSuccessfulRehearsalAt: '2026-04-07T08:00:00.000Z',
        latestEvidenceExecutionSource: 'automated',
        latestEvidenceStatus: 'passed',
        automationHealth: 'healthy',
        manualFallbackActive: false,
        hasOpenAlert: true,
        latestEvidence: { sourceContext: { kind: 'canonical' } },
      },
      runtimeConfig: { appliedMode: 'observe' },
      controlView: { appliedMode: 'observe' },
    }));
    mocks.useLivePromotions.mockReturnValue(queryResult({
      gate: {
        allowed: false,
        reasons: [{ code: 'freshness_stale', message: 'Freshness stale', severity: 'blocked' }],
        currentMode: 'observe',
        currentRuntimeStatus: 'running',
        activeRestartAlertCount: 1,
        restartRequired: true,
        restartInProgress: false,
      },
      currentMode: 'observe',
      currentRuntimeStatus: 'running',
      requests: [],
    }));
    mocks.useRestartAlerts.mockReturnValue(queryResult({
      summary: {
        environment: 'test',
        workerService: 'worker',
        openAlertCount: 1,
        acknowledgedAlertCount: 0,
        resolvedAlertCount: 0,
        activeAlertCount: 1,
        stalledRestartCount: 1,
        divergenceAlerting: true,
        openSourceCategories: ['restart_timeout'],
      },
      alerts: [
        {
          id: 'alert-1',
          environment: 'test',
          dedupeKey: 'dedupe',
          workerService: 'worker',
          sourceCategory: 'restart_timeout',
          reasonCode: 'restart_timeout',
          severity: 'critical',
          status: 'open',
          summary: 'Restart timed out',
          recommendedAction: 'Replay the incident',
          conditionSignature: 'signature',
          occurrenceCount: 1,
          firstSeenAt: '2026-04-07T09:00:00.000Z',
          lastSeenAt: '2026-04-07T09:00:00.000Z',
          lastEvaluatedAt: '2026-04-07T09:00:00.000Z',
          createdAt: '2026-04-07T09:00:00.000Z',
          updatedAt: '2026-04-07T09:00:00.000Z',
        },
      ],
    }));
    mocks.useRestartAlertDeliveries.mockReturnValue(queryResult({
      deliveries: [
        {
          eventId: 'event-1',
          alertId: 'alert-1',
          restartRequestId: 'request-1',
          environment: 'test',
          destinationName: 'primary',
          deliveryStatus: 'sent',
          severity: 'critical',
          attemptedAt: '2026-04-07T09:05:00.000Z',
          summary: 'Sent replay event',
        },
      ],
    }));
    mocks.useRestartAlertDeliverySummary.mockReturnValue(queryResult({
      destinations: [{ destinationName: 'primary', sentCount: 1, failedCount: 0, suppressedCount: 0, skippedCount: 0 }],
    }));
    mocks.useRestartAlertDeliveryTrends.mockReturnValue(queryResult({
      destinations: [{ destinationName: 'primary' }],
    }));
    mocks.useAdapters.mockReturnValue(queryResult({
      adapters: [
        { id: 'a', status: 'healthy', latencyMs: 10, lastSuccessAt: '2026-04-07T09:00:00.000Z', consecutiveFailures: 0 },
        { id: 'b', status: 'degraded', latencyMs: 20, lastSuccessAt: '2026-04-07T09:00:00.000Z', consecutiveFailures: 1 },
        { id: 'c', status: 'down', latencyMs: 0, lastSuccessAt: '2026-04-07T09:00:00.000Z', consecutiveFailures: 2 },
      ],
    }));

    const html = renderToStaticMarkup(<RecoveryPage />);

    expect(html).toContain('Release Gate');
    expect(html).toContain('Recovery Posture');
    expect(html).toContain('Evidence Checklist');
    expect(html).toContain('Adapter Health');
    expect(html).toContain('Incident Timeline');
    expect(html).toContain('Replay Entry Points');
    expect(html).toContain('Replay Rows');
    expect(html).toContain('<details');
  });
});
