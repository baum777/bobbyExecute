'use client';

import { useState } from 'react';
import {
  useAcknowledgeRestartAlert,
  useControlStatus,
  useEmergencyStop,
  useResetKillSwitch,
  useRestartAlerts,
  useRestartWorker,
  useResolveRestartAlert,
} from '@/hooks/use-control';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { LoadingCard } from '@/components/shared/loading-card';
import { ErrorCard } from '@/components/shared/error-card';
import { formatTimestampFull, relativeTime } from '@/lib/utils';
import type { WorkerRestartAlertRecord, WorkerRestartStatus } from '@/types/api';
import { ShieldAlert, ShieldCheck, OctagonX, RotateCcw, AlertTriangle, Clock, Server } from 'lucide-react';

const CONFIRM_TEXT = 'HALT';
const RESET_CONFIRM_TEXT = 'RESET';

function restartBadgeVariant(restart?: WorkerRestartStatus): 'default' | 'success' | 'warning' | 'danger' | 'info' {
  if (!restart) {
    return 'default';
  }

  if (restart.inProgress || (restart.required && !restart.requested)) {
    return 'warning';
  }

  if (restart.lastOutcome === 'failed' || restart.lastOutcome === 'rejected' || restart.lastOutcome === 'cooldown' || restart.lastOutcome === 'unconfigured') {
    return 'danger';
  }

  if (restart.lastOutcome === 'converged' && restart.required === false) {
    return 'success';
  }

  if (restart.requested) {
    return 'info';
  }

  return 'default';
}

function restartBadgeLabel(restart?: WorkerRestartStatus): string {
  if (!restart) {
    return 'UNKNOWN';
  }

  if (restart.inProgress) {
    return 'IN PROGRESS';
  }

  if (restart.required && !restart.requested) {
    return 'PENDING';
  }

  if (restart.requested) {
    return 'REQUESTED';
  }

  if (restart.lastOutcome === 'converged' && restart.required === false) {
    return 'CLEARED';
  }

  if (restart.lastOutcome === 'failed' || restart.lastOutcome === 'rejected' || restart.lastOutcome === 'cooldown' || restart.lastOutcome === 'unconfigured') {
    return restart.lastOutcome.toUpperCase();
  }

  return restart.required ? 'PENDING' : 'IDLE';
}

function safeTimestamp(value?: string): string {
  return value ? formatTimestampFull(value) : '—';
}

function safeRelative(value?: string): string {
  return value ? relativeTime(value) : '—';
}

function buildRestartRequestId(): string {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi && typeof cryptoApi.randomUUID === 'function') {
    return cryptoApi.randomUUID();
  }

  return `restart-${Date.now()}`;
}

function alertBadgeVariant(
  alert?: WorkerRestartAlertRecord
): 'default' | 'success' | 'warning' | 'danger' | 'info' {
  if (!alert) {
    return 'default';
  }

  if (alert.status === 'resolved') {
    return 'success';
  }

  if (alert.status === 'acknowledged') {
    return 'info';
  }

  return alert.severity === 'critical' ? 'danger' : 'warning';
}

function alertBadgeLabel(alert?: WorkerRestartAlertRecord): string {
  if (!alert) {
    return 'UNKNOWN';
  }

  return `${alert.status.toUpperCase()} · ${alert.severity.toUpperCase()}`;
}

export default function ControlPage() {
  const { data: status, isLoading, error, refetch } = useControlStatus();
  const { data: restartAlerts, isLoading: alertsLoading, error: alertsError, refetch: refetchAlerts } = useRestartAlerts();
  const emergencyStop = useEmergencyStop();
  const resetKillSwitch = useResetKillSwitch();
  const restartWorker = useRestartWorker();
  const acknowledgeRestartAlert = useAcknowledgeRestartAlert();
  const resolveRestartAlert = useResolveRestartAlert();

  const [haltInput, setHaltInput] = useState('');
  const [resetInput, setResetInput] = useState('');
  const [restartReason, setRestartReason] = useState('');
  const [showHaltConfirm, setShowHaltConfirm] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [restartNotice, setRestartNotice] = useState<string | null>(null);
  const [alertNotice, setAlertNotice] = useState<string | null>(null);

  const killSwitch = status?.killSwitch;
  const restart = status?.restart;
  const restartAlertSummary = restartAlerts?.summary ?? status?.restartAlerts;
  const restartAlertItems = restartAlerts?.alerts ?? [];
  const worker = status?.worker;
  const runtimeConfig = status?.runtimeConfig;
  const restartActionEnabled = Boolean(restart?.required || restart?.requested) && restart?.inProgress !== true;
  const restartActionLabel = restart?.inProgress
    ? 'Restart In Progress'
    : restart?.required
      ? 'Request Worker Restart'
      : restart?.requested
        ? 'Restart Already Requested'
        : 'Restart Not Needed';
  const restartHint = restart?.inProgress
    ? 'A restart request is already in flight. The control plane will keep showing pending state until the worker converges.'
    : restart?.required
      ? 'This worker still has a restart-required config pending. Request the redeploy from the private control plane.'
      : 'No restart-required config is pending, so the control plane will reject restart requests until one appears.';
  const activeRestartAlerts = restartAlertItems.filter((alert) => alert.status !== 'resolved');

  const handleEmergencyStop = () => {
    if (haltInput !== CONFIRM_TEXT) return;
    emergencyStop.mutate(undefined, {
      onSuccess: () => {
        setHaltInput('');
        setShowHaltConfirm(false);
      },
    });
  };

  const handleReset = () => {
    if (resetInput !== RESET_CONFIRM_TEXT) return;
    resetKillSwitch.mutate(undefined, {
      onSuccess: () => {
        setResetInput('');
        setShowResetConfirm(false);
      },
    });
  };

  const handleRestartWorker = () => {
    if (!restartActionEnabled) return;
    const idempotencyKey = buildRestartRequestId();
    restartWorker.mutate(
      {
        reason: restartReason.trim() || undefined,
        idempotencyKey,
      },
      {
        onSuccess: (response) => {
          setRestartNotice(response.message);
          setRestartReason('');
        },
      }
    );
  };

  const handleAcknowledgeAlert = (alertId: string) => {
    acknowledgeRestartAlert.mutate(
      { id: alertId, input: { note: 'dashboard acknowledgment' } },
      {
        onSuccess: (response) => {
          setAlertNotice(response.message);
        },
      }
    );
  };

  const handleResolveAlert = (alertId: string) => {
    resolveRestartAlert.mutate(
      { id: alertId, input: { note: 'dashboard resolution' } },
      {
        onSuccess: (response) => {
          setAlertNotice(response.message);
        },
      }
    );
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">Control</h2>
          <p className="text-sm text-text-muted">Safety controls, worker restarts, and emergency actions</p>
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
        <p className="text-sm text-text-muted">Safety controls, worker restarts, and emergency actions</p>
      </div>

      <Card className="border-border-default">
        <CardHeader>
          <div className="flex items-center gap-3">
            <Server className="h-5 w-5 text-accent-cyan" />
            <div>
              <CardTitle className="text-text-primary font-semibold text-base">
                Worker Restart State
              </CardTitle>
              <p className="text-xs text-text-muted mt-0.5">
                Restart-required state is tracked in the private control plane and converges after the worker restarts.
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex flex-wrap items-center gap-3">
            <Badge variant={restartBadgeVariant(restart)} className="text-sm px-3 py-1">
              {restartBadgeLabel(restart)}
            </Badge>
            <span className="text-xs text-text-muted">
              Pending version: {restart?.pendingVersionId ?? runtimeConfig?.requestedVersionId ?? '—'}
            </span>
            <span className="text-xs text-text-muted">
              Required: {restart?.required ? 'yes' : 'no'}
            </span>
            <span className="text-xs text-text-muted">
              Requested: {restart?.requested ? 'yes' : 'no'}
            </span>
          </div>

          {restart?.restartRequiredReason && (
            <div className="rounded border border-accent-warning/30 bg-accent-warning/5 p-3">
              <p className="text-sm font-medium text-accent-warning">Restart reason</p>
              <p className="mt-1 text-sm text-text-secondary">{restart.restartRequiredReason}</p>
            </div>
          )}

          {restartNotice && (
            <div className="rounded border border-accent-success/30 bg-accent-success/5 p-3">
              <p className="text-sm font-medium text-accent-success">Latest orchestration result</p>
              <p className="mt-1 text-sm text-text-secondary">{restartNotice}</p>
            </div>
          )}

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
              <p className="text-xs uppercase tracking-wide text-text-muted">Applied version</p>
              <p className="mt-1 text-sm text-text-primary">{runtimeConfig?.appliedVersionId ?? worker?.lastAppliedVersionId ?? '—'}</p>
            </div>
            <div className="rounded border border-border-subtle bg-bg-surface-hover/50 p-3">
              <p className="text-xs uppercase tracking-wide text-text-muted">Last valid version</p>
              <p className="mt-1 text-sm text-text-primary">{runtimeConfig?.lastValidVersionId ?? worker?.lastValidVersionId ?? '—'}</p>
            </div>
            <div className="rounded border border-border-subtle bg-bg-surface-hover/50 p-3">
              <p className="text-xs uppercase tracking-wide text-text-muted">Pending apply</p>
              <p className="mt-1 text-sm text-text-primary">{runtimeConfig?.pendingApply ? 'yes' : 'no'}</p>
            </div>
            <div className="rounded border border-border-subtle bg-bg-surface-hover/50 p-3">
              <p className="text-xs uppercase tracking-wide text-text-muted">Pause / kill switch</p>
              <p className="mt-1 text-sm text-text-primary">
                {runtimeConfig?.paused ? 'paused' : 'running'}
                {runtimeConfig?.killSwitch ? ' / halted' : ''}
              </p>
            </div>
          </div>

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
              disabled={!restartActionEnabled || restartWorker.isPending}
            />
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                variant="default"
                size="lg"
                className="w-full sm:w-auto"
                disabled={!restartActionEnabled || restartWorker.isPending}
                onClick={handleRestartWorker}
              >
                {restartWorker.isPending ? 'Requesting...' : restartActionLabel}
              </Button>
              <Button
                variant="ghost"
                size="lg"
                onClick={() => {
                  setRestartReason('');
                  setRestartNotice(null);
                }}
              >
                Clear
              </Button>
            </div>
            <p className="text-xs text-text-muted">{restartHint}</p>
            {restartWorker.isError && (
              <p className="text-xs text-accent-danger">
                Restart request failed: {restartWorker.error instanceof Error ? restartWorker.error.message : 'Unknown error'}
              </p>
            )}
            <p className="text-xs text-text-muted flex items-center gap-1.5">
              <Clock className="h-3 w-3" />
              POST /api/control/restart-worker
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border-default">
        <CardHeader>
          <div className="flex items-center gap-3">
            <ShieldAlert className="h-5 w-5 text-accent-warning" />
            <div>
              <CardTitle className="text-text-primary font-semibold text-base">
                Restart Alerts
              </CardTitle>
              <p className="text-xs text-text-muted mt-0.5">
                Operator-visible restart incidents, acknowledgement state, and convergence status.
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded border border-border-subtle bg-bg-surface-hover/50 p-3">
              <p className="text-xs uppercase tracking-wide text-text-muted">Open alerts</p>
              <p className="mt-1 text-sm text-text-primary">{restartAlertSummary?.openAlertCount ?? 0}</p>
            </div>
            <div className="rounded border border-border-subtle bg-bg-surface-hover/50 p-3">
              <p className="text-xs uppercase tracking-wide text-text-muted">Acknowledged</p>
              <p className="mt-1 text-sm text-text-primary">{restartAlertSummary?.acknowledgedAlertCount ?? 0}</p>
            </div>
            <div className="rounded border border-border-subtle bg-bg-surface-hover/50 p-3">
              <p className="text-xs uppercase tracking-wide text-text-muted">Highest severity</p>
              <p className="mt-1 text-sm text-text-primary">{restartAlertSummary?.highestOpenSeverity?.toUpperCase() ?? 'NONE'}</p>
            </div>
            <div className="rounded border border-border-subtle bg-bg-surface-hover/50 p-3">
              <p className="text-xs uppercase tracking-wide text-text-muted">Last convergence</p>
              <p className="mt-1 text-sm text-text-primary">{safeRelative(restartAlertSummary?.lastSuccessfulRestartConvergenceAt)}</p>
              <p className="text-xs text-text-muted">{safeTimestamp(restartAlertSummary?.lastSuccessfulRestartConvergenceAt)}</p>
            </div>
            <div className="rounded border border-border-subtle bg-bg-surface-hover/50 p-3">
              <p className="text-xs uppercase tracking-wide text-text-muted">External notifications</p>
              <p className="mt-1 text-sm text-text-primary">{restartAlertSummary?.externalNotificationCount ?? 0}</p>
            </div>
            <div className="rounded border border-border-subtle bg-bg-surface-hover/50 p-3">
              <p className="text-xs uppercase tracking-wide text-text-muted">Notification failures</p>
              <p className="mt-1 text-sm text-text-primary">{restartAlertSummary?.notificationFailureCount ?? 0}</p>
            </div>
            <div className="rounded border border-border-subtle bg-bg-surface-hover/50 p-3">
              <p className="text-xs uppercase tracking-wide text-text-muted">Notification suppression</p>
              <p className="mt-1 text-sm text-text-primary">{restartAlertSummary?.notificationSuppressedCount ?? 0}</p>
            </div>
            <div className="rounded border border-border-subtle bg-bg-surface-hover/50 p-3">
              <p className="text-xs uppercase tracking-wide text-text-muted">Latest notification</p>
              <p className="mt-1 text-sm text-text-primary">{restartAlertSummary?.latestNotificationStatus?.toUpperCase() ?? 'NONE'}</p>
              <p className="text-xs text-text-muted">{safeTimestamp(restartAlertSummary?.latestNotificationAt)}</p>
            </div>
          </div>

          <p className="text-xs text-text-muted">
            Alerting: {restartAlertSummary?.divergenceAlerting ? 'yes' : 'no'}
            {' · '}
            Stalled or failed restarts: {restartAlertSummary?.stalledRestartCount ?? 0}
            {' · '}
            Active alerts: {restartAlertSummary?.activeAlertCount ?? 0}
          </p>

          {alertNotice && (
            <div className="rounded border border-accent-success/30 bg-accent-success/5 p-3">
              <p className="text-sm font-medium text-accent-success">Alert action result</p>
              <p className="mt-1 text-sm text-text-secondary">{alertNotice}</p>
            </div>
          )}

          {alertsLoading && !alertsError && (
            <div className="rounded border border-border-subtle bg-bg-surface-hover/50 p-3 text-sm text-text-muted">
              Loading restart alerts...
            </div>
          )}

          {alertsError && (
            <div className="rounded border border-accent-danger/30 bg-accent-danger/5 p-3">
              <p className="text-sm font-medium text-accent-danger">Alert loading failed</p>
              <p className="mt-1 text-sm text-text-secondary">
                {alertsError instanceof Error ? alertsError.message : 'Unable to load restart alerts'}
              </p>
              <Button variant="ghost" size="sm" className="mt-3" onClick={() => refetchAlerts()}>
                Retry alerts
              </Button>
            </div>
          )}

          {!alertsError && !alertsLoading && activeRestartAlerts.length === 0 ? (
            <div className="rounded border border-border-subtle bg-bg-surface-hover/50 p-4 text-sm text-text-muted">
              No active restart alerts.
            </div>
          ) : (
            <div className="space-y-3">
              {activeRestartAlerts.map((alert) => (
                <div key={alert.id} className="rounded border border-border-subtle bg-bg-surface-hover/40 p-4 space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={alertBadgeVariant(alert)} className="text-xs px-2 py-0.5">
                          {alertBadgeLabel(alert)}
                        </Badge>
                        <span className="text-xs text-text-muted">
                          {alert.sourceCategory.replaceAll('_', ' ')}
                        </span>
                      </div>
                      <p className="text-sm font-medium text-text-primary">{alert.summary}</p>
                      <p className="text-xs text-text-muted">{alert.recommendedAction}</p>
                    </div>
                    <div className="text-right text-xs text-text-muted">
                      <div>Request: {alert.restartRequestId ?? '—'}</div>
                      <div>Target: {alert.targetVersionId ?? '—'}</div>
                      <div>Occurrences: {alert.occurrenceCount}</div>
                    </div>
                  </div>

                  <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4 text-xs text-text-muted">
                    <div>First seen: {safeTimestamp(alert.firstSeenAt)}</div>
                    <div>Last seen: {safeTimestamp(alert.lastSeenAt)}</div>
                    <div>Acknowledged: {alert.acknowledgedAt ? `${safeTimestamp(alert.acknowledgedAt)} · ${alert.acknowledgedBy ?? '—'}` : 'No'}</div>
                    <div>Resolved: {alert.resolvedAt ? `${safeTimestamp(alert.resolvedAt)} · ${alert.resolvedBy ?? '—'}` : 'No'}</div>
                  </div>

                  <div className="rounded border border-border-subtle bg-bg-surface-hover/30 p-3 text-xs text-text-muted space-y-1">
                    <p>
                      Notification status: {alert.notification?.latestDeliveryStatus?.toUpperCase() ?? 'NONE'}
                      {alert.notification?.externallyNotified ? ' · externally notified' : ' · local only'}
                    </p>
                    <p>
                      Sink: {alert.notification?.sinkName ?? '—'}
                      {alert.notification?.sinkType ? ` (${alert.notification.sinkType})` : ''}
                      {' · '}
                      Attempts: {alert.notification?.attemptCount ?? 0}
                    </p>
                    {alert.status === 'resolved' && (
                      <p>
                        Recovery notification: {alert.notification?.resolutionNotificationSent ? 'sent' : 'not sent'}
                        {alert.notification?.resolutionNotificationAt ? ` · ${safeTimestamp(alert.notification.resolutionNotificationAt)}` : ''}
                      </p>
                    )}
                    {(alert.notification?.lastFailureReason || alert.notification?.suppressionReason) && (
                      <p>
                        {alert.notification?.lastFailureReason ? `Failure: ${alert.notification.lastFailureReason}` : ''}
                        {alert.notification?.lastFailureReason && alert.notification?.suppressionReason ? ' · ' : ''}
                        {alert.notification?.suppressionReason ? `Suppressed: ${alert.notification.suppressionReason}` : ''}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                    {alert.status === 'open' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={acknowledgeRestartAlert.isPending}
                        onClick={() => handleAcknowledgeAlert(alert.id)}
                      >
                        {acknowledgeRestartAlert.isPending ? 'Acknowledging...' : 'Acknowledge'}
                      </Button>
                    )}
                    {alert.status === 'acknowledged' && (
                      <Button
                        variant="default"
                        size="sm"
                        disabled={resolveRestartAlert.isPending}
                        onClick={() => handleResolveAlert(alert.id)}
                      >
                        {resolveRestartAlert.isPending ? 'Resolving...' : 'Resolve'}
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="text-xs text-text-muted flex items-center gap-1.5">
            <Clock className="h-3 w-3" />
            Source: Control /control/restart-alerts
          </div>
        </CardContent>
      </Card>

      <Card className={killSwitch?.halted ? 'border-accent-danger/50' : 'border-accent-success/30'}>
        <CardHeader>
          <div className="flex items-center gap-3">
            {killSwitch?.halted ? (
              <OctagonX className="h-5 w-5 text-accent-danger" />
            ) : (
              <ShieldCheck className="h-5 w-5 text-accent-success" />
            )}
            <div>
              <CardTitle className="text-text-primary font-semibold text-base">
                Kill Switch Status
              </CardTitle>
              <p className="text-xs text-text-muted mt-0.5">Current system safety state</p>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3 mb-4">
            <Badge variant={killSwitch?.halted ? 'danger' : 'success'} className="text-sm px-3 py-1">
              {killSwitch?.halted ? 'HALTED' : 'ACTIVE'}
            </Badge>
            {killSwitch?.halted && killSwitch?.triggeredAt && (
              <span className="text-xs text-text-muted">
                since {formatTimestampFull(killSwitch.triggeredAt)}
              </span>
            )}
          </div>
          {killSwitch?.halted && killSwitch?.reason && (
            <div className="rounded border border-accent-danger/30 bg-accent-danger/5 p-3 mb-4">
              <p className="text-sm text-accent-danger font-medium">Reason</p>
              <p className="text-sm text-text-secondary mt-1">{killSwitch.reason}</p>
            </div>
          )}
          <div className="text-xs text-text-muted flex items-center gap-1.5">
            <Clock className="h-3 w-3" />
            Source: Control /control/status
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 grid-cols-1 lg:grid-cols-2">
        <Card className="border-accent-danger/30">
          <CardHeader>
            <div className="flex items-center gap-3">
              <ShieldAlert className="h-5 w-5 text-accent-danger" />
              <div>
                <CardTitle className="text-text-primary font-semibold">Emergency Stop</CardTitle>
                <p className="text-xs text-text-muted mt-0.5">
                  Immediately halt all trading operations
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="rounded border border-accent-warning/30 bg-accent-warning/5 p-3 mb-4">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-accent-warning shrink-0 mt-0.5" />
                <p className="text-xs text-text-secondary">
                  This will immediately stop all trading activity. The bot will not execute any new
                  trades until the kill switch is manually reset. Use only in emergency situations.
                </p>
              </div>
            </div>

            {!showHaltConfirm ? (
              <Button
                variant="danger"
                size="lg"
                className="w-full"
                disabled={killSwitch?.halted || emergencyStop.isPending}
                onClick={() => setShowHaltConfirm(true)}
              >
                <OctagonX className="h-4 w-4" />
                {killSwitch?.halted ? 'Already Halted' : 'Halt Trading'}
              </Button>
            ) : (
              <div className="space-y-3 animate-fade-in">
                <p className="text-sm text-accent-danger font-medium">
                  Type <code className="bg-bg-primary px-1.5 py-0.5 rounded text-accent-danger">{CONFIRM_TEXT}</code> to confirm
                </p>
                <Input
                  value={haltInput}
                  onChange={(e) => setHaltInput(e.target.value)}
                  placeholder={`Type ${CONFIRM_TEXT} to confirm...`}
                  className="border-accent-danger/30 focus-visible:ring-accent-danger/50"
                  autoFocus
                />
                <div className="flex gap-2">
                  <Button
                    variant="danger"
                    className="flex-1"
                    disabled={haltInput !== CONFIRM_TEXT || emergencyStop.isPending}
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
                {emergencyStop.isError && (
                  <p className="text-xs text-accent-danger">
                    Failed to trigger emergency stop. Try again.
                  </p>
                )}
              </div>
            )}
          </CardContent>
          <CardFooter>
            <p className="text-xs text-text-muted flex items-center gap-1.5">
              <Clock className="h-3 w-3" />
              POST /api/control/emergency-stop
            </p>
          </CardFooter>
        </Card>

        <Card className={killSwitch?.halted ? 'border-accent-cyan/30' : 'border-border-default opacity-60'}>
          <CardHeader>
            <div className="flex items-center gap-3">
              <RotateCcw className="h-5 w-5 text-accent-cyan" />
              <div>
                <CardTitle className="text-text-primary font-semibold">
                  Reset Kill Switch
                </CardTitle>
                <p className="text-xs text-text-muted mt-0.5">
                  Re-enable trading after emergency stop
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {!killSwitch?.halted ? (
              <p className="text-sm text-text-muted">
                Kill switch is not active. No reset needed.
              </p>
            ) : !showResetConfirm ? (
              <Button
                variant="default"
                size="lg"
                className="w-full"
                disabled={!killSwitch?.halted || resetKillSwitch.isPending}
                onClick={() => setShowResetConfirm(true)}
              >
                <RotateCcw className="h-4 w-4" />
                Reset Kill Switch
              </Button>
            ) : (
              <div className="space-y-3 animate-fade-in">
                <p className="text-sm text-accent-cyan font-medium">
                  Type <code className="bg-bg-primary px-1.5 py-0.5 rounded text-accent-cyan">{RESET_CONFIRM_TEXT}</code> to confirm
                </p>
                <Input
                  value={resetInput}
                  onChange={(e) => setResetInput(e.target.value)}
                  placeholder={`Type ${RESET_CONFIRM_TEXT} to confirm...`}
                  autoFocus
                />
                <div className="flex gap-2">
                  <Button
                    variant="default"
                    className="flex-1"
                    disabled={resetInput !== RESET_CONFIRM_TEXT || resetKillSwitch.isPending}
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
                {resetKillSwitch.isError && (
                  <p className="text-xs text-accent-danger">
                    Failed to reset kill switch. Try again.
                  </p>
                )}
              </div>
            )}
          </CardContent>
          <CardFooter>
            <p className="text-xs text-text-muted flex items-center gap-1.5">
              <Clock className="h-3 w-3" />
              POST /api/control/reset
            </p>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
