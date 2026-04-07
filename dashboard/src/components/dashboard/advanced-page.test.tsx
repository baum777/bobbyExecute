import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  useAdapters: vi.fn(),
  useDecisionAdvisory: vi.fn(),
  useDecisions: vi.fn(),
  useMetrics: vi.fn(),
}));

vi.mock('@/hooks/use-adapters', () => ({ useAdapters: mocks.useAdapters }));
vi.mock('@/hooks/use-decision-advisory', () => ({ useDecisionAdvisory: mocks.useDecisionAdvisory }));
vi.mock('@/hooks/use-decisions', () => ({ useDecisions: mocks.useDecisions }));
vi.mock('@/hooks/use-metrics', () => ({ useMetrics: mocks.useMetrics }));

import { AdvancedPage } from './advanced-page';

function queryResult(data: unknown) {
  return { data, isLoading: false, error: null, refetch: vi.fn() };
}

describe('AdvancedPage', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('keeps advanced detail secondary and explicitly labels deferred groups', () => {
    mocks.useMetrics.mockReturnValue(queryResult({
      surfaceKind: 'derived',
      p95LatencyMs: { adapter: 120, quote: 80 },
    }));
    mocks.useAdapters.mockReturnValue(queryResult({
      adapters: [
        { id: 'adapter-a', status: 'healthy', latencyMs: 10, lastSuccessAt: '2026-04-07T09:00:00.000Z', consecutiveFailures: 0 },
      ],
    }));
    mocks.useDecisions.mockReturnValue(queryResult({
      decisions: [
        {
          id: 'legacy-1',
          timestamp: '2026-04-07T08:59:00.000Z',
          action: 'block',
          token: 'LEGACY-1',
          confidence: 0.2,
          reasons: ['projection'],
          provenanceKind: 'legacy_projection',
          source: 'action_log_projection',
        },
        {
          id: 'canon-1',
          timestamp: '2026-04-07T09:00:00.000Z',
          action: 'allow',
          token: 'CANON-1',
          confidence: 0.9,
          reasons: ['canonical'],
          provenanceKind: 'canonical',
          source: 'runtime_cycle_summary',
        },
      ],
    }));
    mocks.useDecisionAdvisory.mockReturnValue(queryResult({
      traceId: 'canon-1',
      enabled: true,
      canonical: {},
      advisory: {
        summary: 'Advisory summary',
        reasoning: 'Advisory reasoning',
        confidence: 0.77,
        provider: 'openai',
        model: 'gpt-5.4',
      },
      advisorySecondary: {
        summary: 'Secondary summary',
        reasoning: 'Secondary reasoning',
        confidence: 0.41,
        provider: 'openai',
        model: 'gpt-5.4-mini',
      },
      audits: [{ traceId: 'canon-1', provider: 'openai', model: 'gpt-5.4', latencyMs: 42, success: true }],
    }));

    const html = renderToStaticMarkup(<AdvancedPage />);

    expect(mocks.useDecisionAdvisory).toHaveBeenCalledWith('canon-1');
    expect(html).toContain('Adapter Inspector');
    expect(html).toContain('AI Sources');
    expect(html).toContain('Legacy Projection Feed');
    expect(html).toContain('Deferred Groups');
    expect(html).toContain('<details');
    expect(html).toContain('LEGACY-1');
    expect(html).not.toContain('CANON-1');
    expect(html).not.toContain('Adapter Health');
    expect(html).not.toContain('Decision Surface');
    expect(html).toContain('gpt-5.4');
  });
});
