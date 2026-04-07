import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  useControlStatus: vi.fn(),
  useLivePromotions: vi.fn(),
  useRestartAlerts: vi.fn(),
  useDecisions: vi.fn(),
  useHealth: vi.fn(),
  useSummary: vi.fn(),
  useMetrics: vi.fn(),
}));

vi.mock('@/hooks/use-control', () => ({
  useControlStatus: mocks.useControlStatus,
  useLivePromotions: mocks.useLivePromotions,
  useRestartAlerts: mocks.useRestartAlerts,
}));
vi.mock('@/hooks/use-decisions', () => ({ useDecisions: mocks.useDecisions }));
vi.mock('@/hooks/use-health', () => ({ useHealth: mocks.useHealth }));
vi.mock('@/hooks/use-summary', () => ({ useSummary: mocks.useSummary }));
vi.mock('@/hooks/use-metrics', () => ({ useMetrics: mocks.useMetrics }));

import { OverviewPage } from './overview-page';

function queryResult(data: unknown) {
  return { data, isLoading: false, error: null, refetch: vi.fn() };
}

describe('OverviewPage', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('keeps the mobile reading order aligned with the V1 summary priority', () => {
    mocks.useControlStatus.mockReturnValue(queryResult({
      killSwitch: { halted: false },
      restart: { required: false, inProgress: false },
      databaseRehearsalStatus: { freshnessStatus: 'healthy', blockedByFreshness: false },
      liveControl: { mode: 'observe' },
    }));
    mocks.useLivePromotions.mockReturnValue(queryResult({
      gate: {
        allowed: true,
        restartRequired: false,
        reasons: [],
      },
      currentMode: 'observe',
      currentRuntimeStatus: 'running',
    }));
    mocks.useRestartAlerts.mockReturnValue(queryResult({
      summary: {
        lastSuccessfulRestartConvergenceAt: '2026-04-07T09:00:00.000Z',
        latestNotificationStatus: 'ok',
      },
      alerts: [],
    }));
    mocks.useDecisions.mockReturnValue(queryResult({
      decisions: [
        {
          id: 'legacy-1',
          timestamp: '2026-04-07T09:59:00.000Z',
          action: 'block',
          token: 'LEGACY-1',
          confidence: 0.2,
          reasons: ['Legacy reason'],
          provenanceKind: 'legacy_projection',
          source: 'action_log_projection',
        },
        {
          id: 'canonical-1',
          timestamp: '2026-04-07T10:00:00.000Z',
          action: 'allow',
          token: 'CANON-1',
          confidence: 0.91,
          reasons: ['Canonical reason'],
          provenanceKind: 'canonical',
          source: 'runtime_cycle_summary',
        },
      ],
    }));
    mocks.useHealth.mockReturnValue(queryResult({
      status: 'OK',
      uptimeMs: 3_600_000,
      version: '1.0.0',
      killSwitch: { halted: false },
      surfaceKind: 'operational',
    }));
    mocks.useSummary.mockReturnValue(queryResult({
      botStatus: 'running',
      riskScore: 0.2,
      chaosPassRate: 0.95,
      dataQuality: 0.9,
      lastDecisionAt: '2026-04-07T09:58:00.000Z',
      tradesToday: 12,
      metricProvenance: {
        riskScore: 'derived',
        chaosPassRate: 'derived',
        dataQuality: 'derived',
        lastDecisionAt: 'operational',
        tradesToday: 'operational',
      },
    }));
    mocks.useMetrics.mockReturnValue(queryResult({
      surfaceKind: 'derived',
      p95LatencyMs: { adapter: 120, quote: 80 },
    }));

    const html = renderToStaticMarkup(<OverviewPage />);

    const needsAttention = html.indexOf('Needs Attention');
    const releaseGate = html.indexOf('Release Gate');
    const runtimeHealth = html.indexOf('System Health');
    const lastCanonicalDecision = html.indexOf('Last Canonical Decision');
    const incidentSummary = html.indexOf('Incident Summary');
    const tradeHistory = html.indexOf('Trades Today');
    const readinessSnapshot = html.indexOf('P95 Latency');

    expect(needsAttention).toBeGreaterThan(-1);
    expect(releaseGate).toBeGreaterThan(needsAttention);
    expect(runtimeHealth).toBeGreaterThan(releaseGate);
    expect(lastCanonicalDecision).toBeGreaterThan(runtimeHealth);
    expect(incidentSummary).toBeGreaterThan(lastCanonicalDecision);
    expect(tradeHistory).toBeGreaterThan(incidentSummary);
    expect(readinessSnapshot).toBeGreaterThan(tradeHistory);
    expect(html).toContain('CANON-1');
    expect(html).not.toContain('LEGACY-1');
  });
});
