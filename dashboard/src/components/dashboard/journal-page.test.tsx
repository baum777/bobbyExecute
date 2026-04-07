import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  useSummary: vi.fn(),
  useControlStatus: vi.fn(),
  useDecisions: vi.fn(),
}));

vi.mock('@/hooks/use-summary', () => ({ useSummary: mocks.useSummary }));
vi.mock('@/hooks/use-control', () => ({ useControlStatus: mocks.useControlStatus }));
vi.mock('@/hooks/use-decisions', () => ({ useDecisions: mocks.useDecisions }));

import { JournalPage } from './journal-page';

function queryResult(data: unknown) {
  return { data, isLoading: false, error: null, refetch: vi.fn() };
}

describe('JournalPage', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('keeps trade history, control actions, and canonical decision history separate', () => {
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
    mocks.useControlStatus.mockReturnValue(queryResult({
      killSwitch: { halted: false },
      restart: { required: true, requested: false, inProgress: false },
      runtimeConfig: { appliedMode: 'observe' },
      controlView: { appliedMode: 'observe' },
    }));
    mocks.useDecisions.mockReturnValue(queryResult({
      decisions: [
        {
          id: 'legacy-1',
          timestamp: '2026-04-07T09:54:00.000Z',
          action: 'block',
          token: 'LEGACY-1',
          confidence: 0.42,
          reasons: ['Legacy reason'],
          provenanceKind: 'legacy_projection',
          source: 'action_log_projection',
        },
        {
          id: 'canonical-1',
          timestamp: '2026-04-07T09:55:00.000Z',
          action: 'allow',
          token: 'CANON-1',
          confidence: 0.91,
          reasons: ['Canonical reason'],
          provenanceKind: 'canonical',
          source: 'runtime_cycle_summary',
        },
      ],
    }));

    const html = renderToStaticMarkup(<JournalPage />);

    expect(html).toContain('Trade History');
    expect(html).toContain('Control Actions');
    expect(html).toContain('Canonical Decision History');
    expect(html).toContain('CANON-1');
    expect(html).not.toContain('LEGACY-1');
    expect(html).toContain('Export');
  });
});
