import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  useOperatorSession: vi.fn(),
  useLogin: vi.fn(),
  useLogout: vi.fn(),
  useControlStatus: vi.fn(),
  useLivePromotions: vi.fn(),
  useEmergencyStop: vi.fn(),
  useResetKillSwitch: vi.fn(),
  useRestartWorker: vi.fn(),
  useRequestLivePromotion: vi.fn(),
  useApproveLivePromotion: vi.fn(),
  useDenyLivePromotion: vi.fn(),
  useApplyLivePromotion: vi.fn(),
  useRollbackLivePromotion: vi.fn(),
}));

vi.mock('@/hooks/use-control', () => mocks);

import { ControlPage } from './control-page';

const mutate = vi.fn();
const refetch = vi.fn();

function queryResult(data: unknown) {
  return { data, isLoading: false, error: null, refetch };
}

describe('ControlPage', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('keeps the control surface focused on operator actions and runtime state only', () => {
    mocks.useOperatorSession.mockReturnValue(queryResult({
      configured: true,
      authenticated: true,
      session: {
        sessionId: 'session-admin',
        actorId: 'admin-operator',
        displayName: 'Admin Operator',
        role: 'admin',
        issuedAt: '2026-04-07T10:00:00.000Z',
        expiresAt: '2026-04-07T12:00:00.000Z',
      },
    }));
    mocks.useLogin.mockReturnValue({ mutate, isPending: false, isError: false });
    mocks.useLogout.mockReturnValue({ mutate, isPending: false, isError: false });
    mocks.useControlStatus.mockReturnValue(queryResult({
      killSwitch: { halted: false },
      runtimeConfig: {
        appliedMode: 'observe',
        requestedMode: 'observe',
        requestedVersionId: 'runtime-1',
        appliedVersionId: 'runtime-1',
        lastValidVersionId: 'runtime-1',
      },
      controlView: {
        appliedMode: 'observe',
        requestedMode: 'observe',
        requestedVersionId: 'runtime-1',
        appliedVersionId: 'runtime-1',
        lastValidVersionId: 'runtime-1',
      },
      restart: {
        required: false,
        requested: false,
        inProgress: false,
        lastOutcome: 'converged',
      },
      worker: {
        workerId: 'worker-1',
        lastHeartbeatAt: '2026-04-07T10:00:00.000Z',
        lastCycleAt: '2026-04-07T09:59:00.000Z',
        lastSeenReloadNonce: 0,
        lastAppliedVersionId: 'runtime-1',
        lastValidVersionId: 'runtime-1',
        degraded: false,
        observedAt: '2026-04-07T10:00:00.000Z',
      },
      liveControl: { mode: 'auto' },
    }));
    mocks.useLivePromotions.mockReturnValue(queryResult({
      gate: {
        allowed: false,
        reasons: [{ code: 'freshness_stale', message: 'Freshness is stale', severity: 'blocked' }],
        currentMode: 'observe',
        currentRuntimeStatus: 'running',
        activeRestartAlertCount: 1,
        restartRequired: false,
        restartInProgress: false,
      },
      currentMode: 'observe',
      currentRuntimeStatus: 'running',
      requests: [
        {
          id: 'request-1',
          targetMode: 'live_limited',
          requestedByDisplayName: 'Admin Operator',
          requestedByRole: 'admin',
          requestReason: 'Expand live window',
          workflowStatus: 'pending',
          applicationStatus: 'pending_restart',
          requestedAt: '2026-04-07T09:00:00.000Z',
        },
      ],
    }));
    mocks.useEmergencyStop.mockReturnValue({ mutate, isPending: false, isError: false, error: null });
    mocks.useResetKillSwitch.mockReturnValue({ mutate, isPending: false, isError: false, error: null });
    mocks.useRestartWorker.mockReturnValue({ mutate, isPending: false, isError: false, error: null });
    mocks.useRequestLivePromotion.mockReturnValue({ mutate, isPending: false, isError: false, error: null });
    mocks.useApproveLivePromotion.mockReturnValue({ mutate, isPending: false, isError: false, error: null });
    mocks.useDenyLivePromotion.mockReturnValue({ mutate, isPending: false, isError: false, error: null });
    mocks.useApplyLivePromotion.mockReturnValue({ mutate, isPending: false, isError: false, error: null });
    mocks.useRollbackLivePromotion.mockReturnValue({ mutate, isPending: false, isError: false, error: null });

    const html = renderToStaticMarkup(<ControlPage />);

    expect(html).toContain('Operator Access');
    expect(html).toContain('Blocked / Restart State');
    expect(html).toContain('Live Promotion Governance');
    expect(html).toContain('Runtime State');
    expect(html).toContain('Kill Switch');
    expect(html).toContain('Reset Kill Switch');
    expect(html).toContain('Halt Trading');
    expect(html).toContain('After restart');
    expect(html).not.toContain('Delivery Journal');
    expect(html).not.toContain('Restart Alerts');
    expect(html).not.toContain('Rehearsal Freshness');
  });
});
