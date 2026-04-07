import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  useHealth: vi.fn(),
  useSummary: vi.fn(),
  useControlStatus: vi.fn(),
  useLivePromotions: vi.fn(),
  useTheme: vi.fn(),
}));

vi.mock('@/hooks/use-health', () => ({ useHealth: mocks.useHealth }));
vi.mock('@/hooks/use-summary', () => ({ useSummary: mocks.useSummary }));
vi.mock('@/hooks/use-control', () => ({
  useControlStatus: mocks.useControlStatus,
  useLivePromotions: mocks.useLivePromotions,
}));
vi.mock('@/providers/theme-provider', () => ({ useTheme: mocks.useTheme }));

import { Topbar } from './topbar';

function queryResult(data: unknown) {
  return { data, isLoading: false, isStale: false, error: null, refetch: vi.fn() };
}

describe('Topbar', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('keeps the operator status strip visible with the required labels', () => {
    mocks.useHealth.mockReturnValue(queryResult({
      status: 'OK',
      uptimeMs: 3_600_000,
      version: '1.0.0',
      killSwitch: { halted: true, reason: 'Manual halt' },
    }));
    mocks.useSummary.mockReturnValue(queryResult({
      botStatus: 'running',
      lastDecisionAt: '2026-04-07T10:00:00.000Z',
    }));
    mocks.useControlStatus.mockReturnValue(queryResult({
      killSwitch: { halted: true },
      restart: { required: true, inProgress: false },
    }));
    mocks.useLivePromotions.mockReturnValue(queryResult({
      gate: {
        allowed: false,
        restartRequired: true,
        reasons: [{ code: 'freshness_stale', message: 'Freshness stale', severity: 'blocked' }],
      },
    }));
    mocks.useTheme.mockReturnValue({ theme: 'clean', toggleTheme: vi.fn() });

    const html = renderToStaticMarkup(<Topbar onOpenNavigation={vi.fn()} />);

    expect(html).toContain('release_gate');
    expect(html).toContain('kill_switch');
    expect(html).toContain('blocked');
    expect(html).toContain('restart_required');
    expect(html).toContain('Operator status strip');
    expect(html).toContain('md:grid-cols-2');
    expect(html).toContain('lg:grid-cols-4');
    expect(html).toContain('md:inline-flex');
  });
});
