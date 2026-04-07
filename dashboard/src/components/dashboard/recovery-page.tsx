'use client';

import { useAdapters } from '@/hooks/use-adapters';
import {
  useControlStatus,
  useLivePromotions,
  useRestartAlerts,
  useRestartAlertDeliveries,
  useRestartAlertDeliverySummary,
  useRestartAlertDeliveryTrends,
} from '@/hooks/use-control';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { LoadingCard } from '@/components/shared/loading-card';
import { ErrorCard } from '@/components/shared/error-card';
import { formatTimestampFull, relativeTime } from '@/lib/utils';
import { AlertTriangle, Clock, RotateCcw, ShieldAlert, ShieldCheck, Server } from 'lucide-react';

function safeTimestamp(value?: string): string {
  return value ? formatTimestampFull(value) : '—';
}

function safeRelative(value?: string): string {
  return value ? relativeTime(value) : '—';
}

export function RecoveryPage() {
  const { data: controlStatus, isLoading: controlLoading, error: controlError, refetch } = useControlStatus();
  const { data: livePromotions, isLoading: livePromotionsLoading } = useLivePromotions('live_limited');
  const { data: restartAlerts, isLoading: restartAlertsLoading } = useRestartAlerts();
  const { data: deliveries, isLoading: deliveriesLoading } = useRestartAlertDeliveries({ limit: 8 });
  const { data: deliverySummary, isLoading: deliverySummaryLoading } = useRestartAlertDeliverySummary();
  const { data: deliveryTrends, isLoading: deliveryTrendsLoading } = useRestartAlertDeliveryTrends();
  const { data: adapters, isLoading: adaptersLoading } = useAdapters();

  if (controlLoading || livePromotionsLoading || restartAlertsLoading || deliveriesLoading || deliverySummaryLoading || deliveryTrendsLoading || adaptersLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">Recovery</h2>
          <p className="text-sm text-text-muted">Release Gate and recovery controls</p>
        </div>
        <LoadingCard />
        <LoadingCard />
      </div>
    );
  }

  if (controlError) {
    return <ErrorCard message="Failed to load recovery status" onRetry={() => refetch()} />;
  }

  const killSwitch = controlStatus?.killSwitch;
  const restart = controlStatus?.restart;
  const rehearsal = controlStatus?.databaseRehearsalStatus;
  const restartAlertItems = restartAlerts?.alerts ?? [];
  const openRestartAlerts = restartAlertItems.filter((alert) => alert.status !== 'resolved');
  const adapterRows = adapters?.adapters ?? [];
  const adapterCounts = adapterRows.reduce(
    (acc, adapter) => {
      acc[adapter.status] += 1;
      return acc;
    },
    { healthy: 0, degraded: 0, down: 0 }
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-text-primary">Recovery</h2>
        <p className="text-sm text-text-muted">
          Release Gate, recovery posture, evidence checklist, and replay entry points remain explicit on this route.
        </p>
      </div>

      <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
        <Card className={livePromotions?.gate.allowed ? 'border-accent-success/30' : 'border-accent-danger/40'}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Release Gate</CardTitle>
                <p className="text-xs text-text-muted pt-1">Explicit gate state and blockers before release.</p>
              </div>
              <ShieldAlert className="h-4 w-4 text-text-muted" />
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <Badge variant={livePromotions?.gate.allowed ? 'success' : 'danger'} className="text-sm px-3 py-1">
                {livePromotions?.gate.allowed ? 'GATE ALLOWED' : 'GATE BLOCKED'}
              </Badge>
              <span className="text-xs text-text-muted">Current mode: {livePromotions?.currentMode ?? '—'}</span>
              <span className="text-xs text-text-muted">Runtime: {livePromotions?.currentRuntimeStatus ?? '—'}</span>
              <span className="text-xs text-text-muted">Restart required: {livePromotions?.gate.restartRequired ? 'yes' : 'no'}</span>
            </div>
            {livePromotions?.gate.reasons.length ? (
              <div className="space-y-1 rounded border border-border-subtle bg-bg-surface-hover/40 p-3">
                {livePromotions.gate.reasons.map((reason) => (
                  <p key={reason.code} className={`text-sm ${reason.severity === 'blocked' ? 'text-accent-danger' : 'text-accent-warning'}`}>
                    {reason.code}: {reason.message}
                  </p>
                ))}
              </div>
            ) : (
              <p className="text-sm text-text-muted">No blocking gate reasons are currently recorded.</p>
            )}
          </CardContent>
        </Card>

        <Card className={killSwitch?.halted ? 'border-accent-danger/50' : 'border-border-default'}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Recovery Posture</CardTitle>
                <p className="text-xs text-text-muted pt-1">Kill switch, restart state, and freshness posture.</p>
              </div>
              {killSwitch?.halted ? (
                <ShieldAlert className="h-4 w-4 text-accent-danger" />
              ) : (
                <ShieldCheck className="h-4 w-4 text-accent-success" />
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <Badge variant={killSwitch?.halted ? 'danger' : 'success'} className="text-sm px-3 py-1">
                {killSwitch?.halted ? 'HALTED' : 'ACTIVE'}
              </Badge>
              <span className="text-xs text-text-muted">Restart: {restart?.inProgress ? 'in progress' : restart?.required ? 'required' : 'ready'}</span>
              <span className="text-xs text-text-muted">Freshness: {rehearsal?.freshnessStatus?.toUpperCase() ?? '—'}</span>
            </div>
            <p className="text-sm text-text-secondary">
              {rehearsal?.statusMessage ?? 'No rehearsal freshness state is available.'}
            </p>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded border border-border-subtle bg-bg-surface-hover/50 p-3">
                <p className="text-xs uppercase tracking-wide text-text-muted">Restart blocked</p>
                <p className="mt-1 text-sm text-text-primary">{restart?.required ? 'yes' : 'no'}</p>
              </div>
              <div className="rounded border border-border-subtle bg-bg-surface-hover/50 p-3">
                <p className="text-xs uppercase tracking-wide text-text-muted">Manual fallback</p>
                <p className="mt-1 text-sm text-text-primary">{rehearsal?.manualFallbackActive ? 'active' : 'inactive'}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 grid-cols-1 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Evidence Checklist</CardTitle>
              <Clock className="h-4 w-4 text-text-muted" />
            </div>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>Last success: {safeRelative(rehearsal?.lastSuccessfulRehearsalAt)}</p>
            <p>Latest evidence: {rehearsal?.latestEvidenceStatus?.toUpperCase() ?? '—'}</p>
            <p>Execution source: {rehearsal?.latestEvidenceExecutionSource?.toUpperCase() ?? '—'}</p>
            <p>Automation health: {rehearsal?.automationHealth?.toUpperCase() ?? '—'}</p>
            <p>Open alert: {rehearsal?.hasOpenAlert ? 'yes' : 'no'}</p>
            <p className="text-[10px] uppercase tracking-wide text-text-muted">
              Source context: {rehearsal?.latestEvidence?.sourceContext?.kind ?? '—'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Adapter Health</CardTitle>
              <Server className="h-4 w-4 text-text-muted" />
            </div>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-text-muted">Healthy</span>
              <span>{adapterCounts.healthy}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-muted">Degraded</span>
              <span>{adapterCounts.degraded}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-muted">Down</span>
              <span>{adapterCounts.down}</span>
            </div>
            <p className="text-xs text-text-muted">Detailed adapter inspector lives on Advanced.</p>
          </CardContent>
        </Card>

        <details className="rounded-lg border border-border-default bg-bg-surface p-4">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-text-secondary">Replay Entry Points</p>
              <p className="text-xs text-text-muted pt-1">Collapsed by default on smaller screens.</p>
            </div>
            <RotateCcw className="h-4 w-4 text-text-muted" />
          </summary>
          <div className="space-y-2 pt-3 text-sm">
            <p>Deliveries matched: {deliveries?.deliveries.length ?? 0}</p>
            <p>Trend rows: {deliveryTrends?.destinations.length ?? 0}</p>
            <p>Sent: {deliverySummary?.destinations.reduce((sum, row) => sum + row.sentCount, 0) ?? 0}</p>
            <p>Failed: {deliverySummary?.destinations.reduce((sum, row) => sum + row.failedCount, 0) ?? 0}</p>
            <p className="text-xs text-text-muted">Use the delivery timeline below to replay the incident trail.</p>
          </div>
        </details>
      </div>

      <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Incident Timeline</CardTitle>
              <AlertTriangle className="h-4 w-4 text-text-muted" />
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {openRestartAlerts.length === 0 ? (
              <p className="text-sm text-text-muted">No active restart incidents.</p>
            ) : (
              openRestartAlerts.map((alert) => (
                <div key={alert.id} className="rounded border border-border-subtle bg-bg-surface-hover/30 p-3 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={alert.status === 'resolved' ? 'success' : alert.severity === 'critical' ? 'danger' : 'warning'}>
                      {alert.status.toUpperCase()} · {alert.severity.toUpperCase()}
                    </Badge>
                    <span className="text-xs text-text-muted">{alert.sourceCategory.replaceAll('_', ' ')}</span>
                  </div>
                  <p className="text-sm text-text-primary">{alert.summary}</p>
                  <p className="text-xs text-text-muted">Request: {alert.restartRequestId ?? '—'} · Target: {alert.targetVersionId ?? '—'}</p>
                  <p className="text-xs text-text-muted">First seen {safeTimestamp(alert.firstSeenAt)} · Last seen {safeTimestamp(alert.lastSeenAt)}</p>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Replay Rows</CardTitle>
              <RotateCcw className="h-4 w-4 text-text-muted" />
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {(deliveries?.deliveries ?? []).length === 0 ? (
              <p className="text-sm text-text-muted">No delivery history matches the current replay window.</p>
            ) : (
              deliveries?.deliveries.map((row) => (
                <div key={row.eventId} className="rounded border border-border-subtle bg-bg-surface-hover/30 p-3 text-xs text-text-muted space-y-1">
                  <p className="text-sm text-text-primary">
                    {row.deliveryStatus?.toUpperCase() ?? 'NONE'} · {row.destinationName}
                  </p>
                  <p>{row.summary ?? 'No summary available'}</p>
                  <p>Alert: {row.alertId} · Restart request: {row.restartRequestId ?? '—'}</p>
                  <p>Attempted: {safeTimestamp(row.attemptedAt)} · Severity: {row.severity?.toUpperCase() ?? '—'}</p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
