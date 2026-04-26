'use client';

import { useState } from 'react';
import {
  useApproveLivePromotion,
  useApplyLivePromotion,
  useControlStatus,
  useDenyLivePromotion,
  useEmergencyStop,
  useLivePromotions,
  useLogin,
  useLogout,
  useOperatorSession,
  useRequestLivePromotion,
  useResetKillSwitch,
  useRestartWorker,
  useRollbackLivePromotion,
} from '@/hooks/use-control';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ErrorCard } from '@/components/shared/error-card';
import { LoadingCard } from '@/components/shared/loading-card';
import { describeOperatorRole, requiredRoleForAction } from '@/lib/operator-policy';
import { formatTimestampFull, relativeTime } from '@/lib/utils';
import type { LivePromotionRecord, LivePromotionTargetMode } from '@/types/api';
import {
  Clock,
  LogIn,
  LogOut,
  OctagonX,
  RotateCcw,
  Server,
  ShieldAlert,
  ShieldCheck,
  ShieldQuestion,
  UserRound,
} from 'lucide-react';

const CONFIRM_TEXT = 'HALT';
const RESET_CONFIRM_TEXT = 'RESET';

function safeTimestamp(value?: string): string {
  return value ? formatTimestampFull(value) : '—';
}

function safeRelative(value?: string): string {
  return value ? relativeTime(value) : '—';
}

function promotionLabel(status?: LivePromotionRecord['workflowStatus']): string {
  return status ? status.replace(/_/g, ' ').toUpperCase() : 'UNKNOWN';
}

function promotionVariant(status?: LivePromotionRecord['workflowStatus']): 'default' | 'success' | 'warning' | 'danger' | 'info' {
  switch (status) {
    case 'approved':
    case 'applied':
      return 'success';
    case 'blocked':
    case 'denied':
    case 'rolled_back':
      return 'danger';
    case 'pending':
      return 'warning';
    default:
      return 'default';
  }
}

function safeLabel(value: unknown): string {
  return typeof value === 'string' && value.trim().length > 0 ? value : '—';
}

function optionalReason(value: string): { reason?: string } {
  const reason = value.trim();
  return reason ? { reason } : {};
}

export function ControlPage() {
  const [operatorUsername, setOperatorUsername] = useState('');
  const [operatorPassword, setOperatorPassword] = useState('');
  const [promotionTargetMode, setPromotionTargetMode] = useState<LivePromotionTargetMode>('live_limited');
  const [promotionReason, setPromotionReason] = useState('');
  const [restartReason, setRestartReason] = useState('');
  const [haltInput, setHaltInput] = useState('');
  const [resetInput, setResetInput] = useState('');
  const [showHaltConfirm, setShowHaltConfirm] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const { data: operatorSession, isLoading: operatorSessionLoading, error: operatorSessionError, refetch: refetchOperatorSession } = useOperatorSession();
  const login = useLogin();
  const logout = useLogout();
  const { data: status, isLoading, error, refetch } = useControlStatus();
  const { data: livePromotions, isLoading: livePromotionsLoading, error: livePromotionsError, refetch: refetchLivePromotions } = useLivePromotions(promotionTargetMode);

  const emergencyStop = useEmergencyStop();
  const resetKillSwitch = useResetKillSwitch();
  const restartWorker = useRestartWorker();
  const requestLivePromotion = useRequestLivePromotion();
  const approveLivePromotion = useApproveLivePromotion();
  const denyLivePromotion = useDenyLivePromotion();
  const applyLivePromotion = useApplyLivePromotion();
  const rollbackLivePromotion = useRollbackLivePromotion();

  const operatorRole = operatorSession?.session?.role;
  const operatorCanOperate = operatorRole === 'operator' || operatorRole === 'admin';
  const operatorCanAdmin = operatorRole === 'admin';
  const restart = status?.restart;
  const runtimeConfig = status?.runtimeConfig ?? status?.controlView;
  const worker = status?.worker;
  const killSwitch = status?.killSwitch;
  const liveControl = status?.liveControl;

  const handleLogin = () => {
    login.mutate({ username: operatorUsername.trim(), password: operatorPassword });
  };

  const handleLogout = () => {
    logout.mutate();
  };

  const handleEmergencyStop = () => {
    if (!operatorCanAdmin || haltInput !== CONFIRM_TEXT) return;
    emergencyStop.mutate(undefined, {
      onSuccess: () => {
        setShowHaltConfirm(false);
        setHaltInput('');
      },
    });
  };

  const handleReset = () => {
    if (!operatorCanAdmin || resetInput !== RESET_CONFIRM_TEXT) return;
    resetKillSwitch.mutate(undefined, {
      onSuccess: () => {
        setShowResetConfirm(false);
        setResetInput('');
      },
    });
  };

  const handleRestartWorker = () => {
    if (!operatorCanAdmin) return;
    restartWorker.mutate({
      reason: restartReason.trim() || undefined,
      idempotencyKey: `restart-${Date.now()}`,
    });
  };

  const handleRequestLivePromotion = () => {
    if (!operatorCanAdmin) return;
    requestLivePromotion.mutate({
      targetMode: promotionTargetMode,
      reason: promotionReason.trim() || undefined,
    });
  };

  if (isLoading || operatorSessionLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">Control</h2>
          <p className="text-sm text-text-muted">Operator runtime controls and live promotion governance</p>
        </div>
        <LoadingCard />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">Control</h2>
        </div>
        <ErrorCard message="Failed to load control status" onRetry={() => refetch()} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-text-primary">Control</h2>
        <p className="text-sm text-text-muted">Operator runtime controls and immediate safety state only.</p>
      </div>

      <div className="rounded border border-border-subtle bg-bg-surface-hover/30 px-3 py-2 text-xs text-text-secondary">
        This surface owns control actions, runtime state, kill switch state, and governed live promotion. Journal, recovery,
        and advanced diagnostics are separated onto their own routes.
      </div>

      <Card className="border-accent-warning/40 md:hidden">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-text-primary font-semibold text-base">Blocked / Restart State</CardTitle>
              <p className="text-xs text-text-muted mt-0.5">Mobile-first safety and restart summary.</p>
            </div>
            <ShieldAlert className="h-5 w-5 text-accent-warning" />
          </div>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded border border-border-subtle bg-bg-surface-hover/40 p-2">
              <p className="text-[10px] uppercase tracking-wide text-text-muted">release_gate</p>
              <p className="mt-1 text-text-primary">{livePromotions?.gate.allowed ? 'allowed' : 'blocked'}</p>
            </div>
            <div className="rounded border border-border-subtle bg-bg-surface-hover/40 p-2">
              <p className="text-[10px] uppercase tracking-wide text-text-muted">kill_switch</p>
              <p className="mt-1 text-text-primary">{killSwitch?.halted ? 'halted' : 'clear'}</p>
            </div>
            <div className="rounded border border-border-subtle bg-bg-surface-hover/40 p-2">
              <p className="text-[10px] uppercase tracking-wide text-text-muted">blocked</p>
              <p className="mt-1 text-text-primary">{livePromotions?.gate.reasons.filter((reason) => reason.severity === 'blocked').length ?? 0}</p>
            </div>
            <div className="rounded border border-border-subtle bg-bg-surface-hover/40 p-2">
              <p className="text-[10px] uppercase tracking-wide text-text-muted">restart_required</p>
              <p className="mt-1 text-text-primary">{restart?.required ? 'yes' : 'no'}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border-default">
        <CardHeader>
          <div className="flex items-center gap-3">
            <UserRound className="h-5 w-5 text-accent-cyan" />
            <div>
              <CardTitle className="text-text-primary font-semibold text-base">Operator Access</CardTitle>
              <p className="text-xs text-text-muted mt-0.5">
                Privileged controls require an authenticated operator session.
              </p>
            </div>
          </div>
        </CardHeader>
          <CardContent className="space-y-4">
          {operatorSessionError ? (
            <div className="rounded border border-accent-danger/30 bg-accent-danger/5 p-3">
              <p className="text-sm font-medium text-accent-danger">Operator session unavailable</p>
              <Button type="button" variant="ghost" size="sm" className="mt-3" onClick={() => refetchOperatorSession()}>
                Retry session
              </Button>
            </div>
          ) : operatorSession?.authenticated && operatorSession.session ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <Badge variant={operatorCanAdmin ? 'success' : operatorCanOperate ? 'warning' : 'default'} className="text-sm px-3 py-1">
                  {operatorSession.session.role.toUpperCase()}
                </Badge>
                <span className="text-xs text-text-muted">{operatorSession.session.displayName}</span>
                <span className="text-xs text-text-muted">Session: {operatorSession.session.sessionId}</span>
                <span className="text-xs text-text-muted">Expires: {safeTimestamp(operatorSession.session.expiresAt)}</span>
              </div>
              <p className="text-sm text-text-secondary">
                Signed in as <span className="font-medium text-text-primary">{describeOperatorRole(operatorSession.session.role)}</span>.
              </p>
              <Button type="button" variant="ghost" onClick={handleLogout} disabled={logout.isPending}>
                <LogOut className="h-4 w-4" />
                {logout.isPending ? 'Signing out...' : 'Sign out'}
              </Button>
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <div className="space-y-3">
                <Input
                  value={operatorUsername}
                  onChange={(e) => setOperatorUsername(e.target.value)}
                  placeholder="Operator username"
                  autoComplete="username"
                />
                <Input
                  type="password"
                  value={operatorPassword}
                  onChange={(e) => setOperatorPassword(e.target.value)}
                  placeholder="Password"
                  autoComplete="current-password"
                />
                <Button
                  type="button"
                  size="lg"
                  className="w-full md:w-auto"
                  onClick={handleLogin}
                  disabled={login.isPending || operatorUsername.trim().length === 0 || operatorPassword.length === 0}
                >
                  <LogIn className="h-4 w-4" />
                  {login.isPending ? 'Signing in...' : 'Sign in'}
                </Button>
              </div>
              <div className="rounded border border-border-subtle bg-bg-surface-hover/40 p-3 text-sm text-text-muted space-y-2">
                <p className="font-medium text-text-secondary">Access policy</p>
                <p>viewer: read-only reporting.</p>
                <p>operator: operational controls and acknowledgements.</p>
                <p>admin: emergency stop, reset, worker restart, and live promotion governance.</p>
                <p>Auth status: {operatorSession?.configured ? 'configured' : 'not configured'}</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
        <Card className="border-border-default">
          <CardHeader>
            <div className="flex items-center gap-3">
              <ShieldQuestion className="h-5 w-5 text-accent-cyan" />
              <div>
                <CardTitle className="text-text-primary font-semibold text-base">Live Promotion Governance</CardTitle>
                <p className="text-xs text-text-muted mt-0.5">
                  Mode changes are approved and recorded before the runtime can change.
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {livePromotionsError ? (
              <div className="rounded border border-accent-danger/30 bg-accent-danger/5 p-3">
                <p className="text-sm font-medium text-accent-danger">Promotion state unavailable</p>
                <Button type="button" variant="ghost" size="sm" className="mt-3" onClick={() => refetchLivePromotions()}>
                  Retry promotion state
                </Button>
              </div>
            ) : livePromotionsLoading ? (
              <LoadingCard />
            ) : (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-3">
                  <Badge variant={livePromotions?.gate.allowed ? 'success' : 'danger'} className="text-sm px-3 py-1">
                    {livePromotions?.gate.allowed ? 'GATE ALLOWED' : 'GATE BLOCKED'}
                  </Badge>
                  <span className="text-xs text-text-muted">Current mode: {livePromotions?.currentMode ?? '—'}</span>
                  <span className="text-xs text-text-muted">Runtime: {livePromotions?.currentRuntimeStatus ?? '—'}</span>
                  <span className="text-xs text-text-muted">
                    Role required: {requiredRoleForAction('live_promotion_request') ?? 'admin'}
                  </span>
                </div>
                {livePromotions?.gate.reasons.length ? (
                  <div className="rounded border border-border-subtle bg-bg-surface-hover/40 p-3 space-y-1">
                    <p className="text-sm font-medium text-text-secondary">Gate reasons</p>
                    {livePromotions.gate.reasons.map((reason) => (
                      <p key={reason.code} className={`text-sm ${reason.severity === 'blocked' ? 'text-accent-danger' : 'text-accent-warning'}`}>
                        {reason.code}: {reason.message}
                      </p>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-text-muted">No blocking gate reasons are currently recorded.</p>
                )}
                <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-end">
                  <div>
                    <label className="mb-1 block text-xs uppercase tracking-wide text-text-muted">Target mode</label>
                    <select
                      className="w-full rounded border border-border-subtle bg-bg-primary px-3 py-2 text-sm text-text-primary outline-none focus:border-accent-cyan"
                      value={promotionTargetMode}
                      onChange={(event) => setPromotionTargetMode(event.target.value as LivePromotionTargetMode)}
                      disabled={!operatorCanAdmin}
                    >
                      <option value="live_limited">live_limited</option>
                      <option value="live">live</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs uppercase tracking-wide text-text-muted">Reason</label>
                    <Input
                      value={promotionReason}
                      onChange={(e) => setPromotionReason(e.target.value)}
                      placeholder="Promotion reason or rollback note"
                      disabled={!operatorCanAdmin}
                    />
                  </div>
                    <Button
                      type="button"
                      size="lg"
                      className="w-full md:w-auto"
                      onClick={handleRequestLivePromotion}
                      disabled={!operatorCanAdmin || requestLivePromotion.isPending}
                    >
                      {requestLivePromotion.isPending ? 'Requesting...' : 'Request promotion'}
                    </Button>
                </div>
                <div className="space-y-3">
                  <p className="text-sm font-medium text-text-secondary">Promotion requests</p>
                  {livePromotions?.requests.length ? (
                    <div className="space-y-3">
                      {livePromotions.requests.map((request) => {
                        const canApprove = operatorCanAdmin && request.workflowStatus === 'pending';
                        const canDeny = operatorCanAdmin && request.workflowStatus === 'pending';
                        const canApply = operatorCanAdmin && request.workflowStatus === 'approved';
                        const canRollback = operatorCanAdmin && request.workflowStatus === 'applied';
                        return (
                          <div key={request.id} className="rounded border border-border-subtle bg-bg-surface-hover/40 p-3 space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge variant={promotionVariant(request.workflowStatus)} className="text-xs px-2 py-0.5">
                                {promotionLabel(request.workflowStatus)}
                              </Badge>
                              <Badge variant="default" className="text-xs px-2 py-0.5">
                                {request.targetMode}
                              </Badge>
                              <span className="text-xs text-text-muted">
                                Requested by {request.requestedByDisplayName} ({request.requestedByRole})
                              </span>
                            </div>
                            <p className="text-sm text-text-secondary">Reason: {request.requestReason}</p>
                            <div className="grid gap-2 text-xs text-text-muted md:grid-cols-2">
                              <div>Requested: {safeTimestamp(request.requestedAt)}</div>
                              <div>Applied: {safeTimestamp(request.appliedAt)}</div>
                              <div>Approved: {safeTimestamp(request.approvedAt)}</div>
                              <div>Denied: {safeTimestamp(request.deniedAt)}</div>
                              <div>Rolled back: {safeTimestamp(request.rolledBackAt)}</div>
                              <div>Application: {request.applicationStatus}</div>
                            </div>
                            {request.blockedReason && <p className="text-xs text-accent-danger">Blocked: {request.blockedReason}</p>}
                            {request.approvalReason && <p className="text-xs text-accent-success">Approval: {request.approvalReason}</p>}
                            {request.rollbackReason && <p className="text-xs text-accent-warning">Rollback: {request.rollbackReason}</p>}
                            <div className="flex flex-wrap gap-2">
                              <Button type="button" size="sm" variant="outline" disabled={!canApprove} onClick={() => approveLivePromotion.mutate({ id: request.id, input: optionalReason(promotionReason) })}>
                                Approve
                              </Button>
                              <Button type="button" size="sm" variant="ghost" disabled={!canDeny} onClick={() => denyLivePromotion.mutate({ id: request.id, input: optionalReason(promotionReason) })}>
                                Deny
                              </Button>
                              <Button type="button" size="sm" variant="default" disabled={!canApply} onClick={() => applyLivePromotion.mutate({ id: request.id, input: optionalReason(promotionReason) })}>
                                Apply
                              </Button>
                              <Button type="button" size="sm" variant="danger" disabled={!canRollback} onClick={() => rollbackLivePromotion.mutate({ id: request.id, input: optionalReason(promotionReason) })}>
                                Roll back
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="rounded border border-border-subtle bg-bg-surface-hover/50 p-3 text-sm text-text-muted">
                      No live promotion requests are recorded.
                    </div>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-border-default">
          <CardHeader>
            <div className="flex items-center gap-3">
              <Server className="h-5 w-5 text-accent-cyan" />
              <div>
                <CardTitle className="text-text-primary font-semibold text-base">Runtime State</CardTitle>
                <p className="text-xs text-text-muted mt-0.5">Immediate runtime context and restart state.</p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <Badge variant={restart?.inProgress ? 'warning' : restart?.required ? 'danger' : 'success'} className="text-sm px-3 py-1">
                {restart?.inProgress ? 'IN PROGRESS' : restart?.required ? 'RESTART REQUIRED' : 'READY'}
              </Badge>
              <span className="text-xs text-text-muted">Mode: {runtimeConfig?.appliedMode ?? '—'}</span>
              <span className="text-xs text-text-muted">After restart: {restart?.pendingVersionId ?? runtimeConfig?.requestedVersionId ?? '—'}</span>
              <span className="text-xs text-text-muted">Live control: {safeLabel(liveControl?.mode)}</span>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded border border-border-subtle bg-bg-surface-hover/50 p-3">
                <p className="text-xs uppercase tracking-wide text-text-muted">Worker heartbeat</p>
                <p className="mt-1 text-sm text-text-primary">{safeRelative(worker?.lastHeartbeatAt)}</p>
                <p className="text-xs text-text-muted">{safeTimestamp(worker?.lastHeartbeatAt)}</p>
              </div>
              <div className="rounded border border-border-subtle bg-bg-surface-hover/50 p-3">
                <p className="text-xs uppercase tracking-wide text-text-muted">Last successful cycle</p>
                <p className="mt-1 text-sm text-text-primary">{safeRelative(worker?.lastCycleAt)}</p>
                <p className="text-xs text-text-muted">{safeTimestamp(worker?.lastCycleAt)}</p>
              </div>
              <div className="rounded border border-border-subtle bg-bg-surface-hover/50 p-3">
                <p className="text-xs uppercase tracking-wide text-text-muted">Restart required</p>
                <p className="mt-1 text-sm text-text-primary">{restart?.required ? 'yes' : 'no'}</p>
              </div>
              <div className="rounded border border-border-subtle bg-bg-surface-hover/50 p-3">
                <p className="text-xs uppercase tracking-wide text-text-muted">Kill switch</p>
                <p className="mt-1 text-sm text-text-primary">{killSwitch?.halted ? 'halted' : 'running'}</p>
              </div>
            </div>
            {restart?.restartRequiredReason && (
              <p className="text-sm text-text-secondary">Reason: {restart.restartRequiredReason}</p>
            )}
            {restart?.lastOutcome && (
              <p className="text-xs text-text-muted">
                Last outcome: {restart.lastOutcome}
                {restart.lastOutcomeReason ? ` · ${restart.lastOutcomeReason}` : ''}
                {restart.requestedBy ? ` · requested by ${restart.requestedBy}` : ''}
              </p>
            )}
            <div className="space-y-3">
              <Input
                value={restartReason}
                onChange={(e) => setRestartReason(e.target.value)}
                placeholder="Optional restart reason for the audit trail"
                disabled={!operatorCanAdmin || restartWorker.isPending}
              />
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  size="lg"
                  variant="default"
                  className="w-full sm:w-auto"
                  disabled={!operatorCanAdmin || restartWorker.isPending}
                  onClick={handleRestartWorker}
                >
                  {restartWorker.isPending ? 'Requesting...' : 'Request restart'}
                </Button>
                <Button variant="ghost" size="lg" onClick={() => setRestartReason('')}>
                  Clear
                </Button>
              </div>
              <p className="text-xs text-text-muted">
                Restart requests are only available to admin operators.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
        <Card className={killSwitch?.halted ? 'border-accent-danger/50' : 'border-accent-success/30'}>
          <CardHeader>
            <div className="flex items-center gap-3">
              {killSwitch?.halted ? (
                <ShieldAlert className="h-5 w-5 text-accent-danger" />
              ) : (
                <ShieldCheck className="h-5 w-5 text-accent-success" />
              )}
              <div>
                <CardTitle className="text-text-primary font-semibold text-base">Kill Switch</CardTitle>
                <p className="text-xs text-text-muted mt-0.5">Safety state and emergency halt controls.</p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <Badge variant={killSwitch?.halted ? 'danger' : 'success'} className="text-sm px-3 py-1">
                {killSwitch?.halted ? 'HALTED' : 'CLEAR'}
              </Badge>
              {killSwitch?.triggeredAt && <span className="text-xs text-text-muted">Since {safeTimestamp(killSwitch.triggeredAt)}</span>}
            </div>
            {killSwitch?.reason && <p className="text-sm text-text-secondary">Reason: {killSwitch.reason}</p>}
            <Button
              variant="danger"
              size="lg"
              className="w-full"
              disabled={killSwitch?.halted || emergencyStop.isPending || !operatorCanAdmin || showHaltConfirm}
              onClick={() => setShowHaltConfirm(true)}
            >
              <OctagonX className="h-4 w-4" />
              {killSwitch?.halted ? 'Already Halted' : 'Halt Trading'}
            </Button>
            {showHaltConfirm && (
              <div className="space-y-3">
                <p className="text-sm text-accent-danger font-medium">
                  Type <code className="bg-bg-primary px-1.5 py-0.5 rounded text-accent-danger">{CONFIRM_TEXT}</code> to confirm
                </p>
                <Input
                  value={haltInput}
                  onChange={(e) => setHaltInput(e.target.value)}
                  placeholder={`Type ${CONFIRM_TEXT} to confirm...`}
                  className="border-accent-danger/30 focus-visible:ring-accent-danger/50"
                />
                <div className="flex gap-2">
                  <Button
                    variant="danger"
                    className="flex-1"
                    disabled={haltInput !== CONFIRM_TEXT || emergencyStop.isPending || !operatorCanAdmin}
                    onClick={handleEmergencyStop}
                  >
                    {emergencyStop.isPending ? 'Stopping...' : 'Confirm Emergency Stop'}
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setShowHaltConfirm(false);
                      setHaltInput('');
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
          <CardFooter>
            <p className="text-xs text-text-muted flex items-center gap-1.5">
              <Clock className="h-3 w-3" />
              Emergency stop is a control-plane action only.
            </p>
          </CardFooter>
        </Card>

        <Card className={killSwitch?.halted ? 'border-accent-cyan/30' : 'border-border-default opacity-60'}>
          <CardHeader>
            <div className="flex items-center gap-3">
              <RotateCcw className="h-5 w-5 text-accent-cyan" />
              <div>
                <CardTitle className="text-text-primary font-semibold">Reset Kill Switch</CardTitle>
                <p className="text-xs text-text-muted mt-0.5">Re-enable trading after emergency stop</p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {!killSwitch?.halted ? (
              <p className="text-sm text-text-muted">Kill switch is not active. No reset needed.</p>
            ) : !showResetConfirm ? (
              <Button
                variant="default"
                size="lg"
                className="w-full"
                disabled={!killSwitch?.halted || resetKillSwitch.isPending || !operatorCanAdmin}
                onClick={() => setShowResetConfirm(true)}
              >
                <RotateCcw className="h-4 w-4" />
                Reset Kill Switch
              </Button>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-accent-cyan font-medium">
                  Type <code className="bg-bg-primary px-1.5 py-0.5 rounded text-accent-cyan">{RESET_CONFIRM_TEXT}</code> to confirm
                </p>
                <Input
                  value={resetInput}
                  onChange={(e) => setResetInput(e.target.value)}
                  placeholder={`Type ${RESET_CONFIRM_TEXT} to confirm...`}
                />
                <div className="flex gap-2">
                  <Button
                    variant="default"
                    size="lg"
                    className="flex-1"
                    disabled={resetInput !== RESET_CONFIRM_TEXT || resetKillSwitch.isPending || !operatorCanAdmin}
                    onClick={handleReset}
                  >
                    {resetKillSwitch.isPending ? 'Resetting...' : 'Confirm Reset'}
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setShowResetConfirm(false);
                      setResetInput('');
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
          <CardFooter>
            <p className="text-xs text-text-muted flex items-center gap-1.5">
              <Clock className="h-3 w-3" />
              Reset only unlocks the control-plane halt state.
            </p>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
