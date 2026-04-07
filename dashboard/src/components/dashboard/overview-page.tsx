'use client';

import { useControlStatus } from '@/hooks/use-control';
import { useDecisions } from '@/hooks/use-decisions';
import { useLivePromotions } from '@/hooks/use-control';
import { useRestartAlerts } from '@/hooks/use-control';
import { HeroCards } from './hero-cards';
import { ActivitySection } from './activity-section';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/shared/empty-state';
import { ErrorCard } from '@/components/shared/error-card';
import { LoadingCard } from '@/components/shared/loading-card';
import { getFirstCanonicalDecision } from '@/lib/decision-provenance';
import { kpiProvenanceLabel } from '@/lib/kpi-provenance';
import { relativeTime } from '@/lib/utils';
import { AlertTriangle, Clock, ShieldAlert, ScrollText } from 'lucide-react';

export function OverviewPage() {
  const { data: controlStatus, isLoading: controlLoading, error: controlError, refetch: refetchControl } = useControlStatus();
  const { data: livePromotions, isLoading: gateLoading, error: gateError, refetch: refetchGate } = useLivePromotions('live_limited');
  const { data: restartAlerts, isLoading: incidentsLoading, error: incidentsError, refetch: refetchIncidents } = useRestartAlerts();
  const { data: decisions, isLoading: decisionsLoading, error: decisionsError, refetch: refetchDecisions } = useDecisions(10);

  const latestCanonical = getFirstCanonicalDecision(decisions?.decisions);

  if (controlLoading || gateLoading || incidentsLoading || decisionsLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">Overview</h2>
          <p className="text-sm text-text-muted">System overview and operational status</p>
        </div>
        <LoadingCard />
      </div>
    );
  }

  if (controlError) {
    return <ErrorCard message="Failed to load overview control state" onRetry={() => refetchControl()} />;
  }

  if (gateError) {
    return <ErrorCard message="Failed to load overview release gate state" onRetry={() => refetchGate()} />;
  }

  if (incidentsError) {
    return <ErrorCard message="Failed to load overview incidents" onRetry={() => refetchIncidents()} />;
  }

  if (decisionsError) {
    return <ErrorCard message="Failed to load overview decision history" onRetry={() => refetchDecisions()} />;
  }

  const killSwitch = controlStatus?.killSwitch;
  const restart = controlStatus?.restart;
  const rehearsal = controlStatus?.databaseRehearsalStatus;
  const openAlerts = restartAlerts?.alerts.filter((alert) => alert.status !== 'resolved') ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-text-primary">Overview</h2>
        <p className="text-sm text-text-muted">System overview, release gate summary, attention flags, and canonical history snapshot.</p>
      </div>

      <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
        <Card className={killSwitch?.halted || restart?.required || rehearsal?.blockedByFreshness ? 'border-accent-warning/40' : 'border-border-default'}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Needs Attention</CardTitle>
                <p className="text-xs text-text-muted pt-1">Immediate runtime and recovery flags.</p>
              </div>
              <AlertTriangle className="h-4 w-4 text-text-muted" />
            </div>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>Kill switch: {killSwitch?.halted ? 'halted' : 'active'}</p>
            <p>Restart: {restart?.required ? 'required' : 'clear'}{restart?.inProgress ? ' (in progress)' : ''}</p>
            <p>Freshness: {rehearsal?.freshnessStatus?.toUpperCase() ?? '—'}</p>
            <p>Open alerts: {openAlerts.length}</p>
            <p className="text-xs text-text-muted">Blocked by freshness: {rehearsal?.blockedByFreshness ? 'yes' : 'no'}</p>
          </CardContent>
        </Card>

        <Card className={livePromotions?.gate.allowed ? 'border-accent-success/30' : 'border-accent-danger/40'}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Release Gate</CardTitle>
                <p className="text-xs text-text-muted pt-1">Operator-first gate summary.</p>
              </div>
              <ShieldAlert className="h-4 w-4 text-text-muted" />
            </div>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex flex-wrap items-center gap-3">
              <Badge variant={livePromotions?.gate.allowed ? 'success' : 'danger'}>{livePromotions?.gate.allowed ? 'ALLOWED' : 'BLOCKED'}</Badge>
              <span className="text-text-muted">Current mode: {livePromotions?.currentMode ?? '—'}</span>
              <span className="text-text-muted">Runtime: {livePromotions?.currentRuntimeStatus ?? '—'}</span>
            </div>
            {livePromotions?.gate.reasons.length ? (
              <div className="space-y-1">
                {livePromotions.gate.reasons.slice(0, 3).map((reason) => (
                  <p key={reason.code} className={`text-xs ${reason.severity === 'blocked' ? 'text-accent-danger' : 'text-accent-warning'}`}>
                    {reason.code}: {reason.message}
                  </p>
                ))}
              </div>
            ) : (
              <p className="text-xs text-text-muted">No blocking gate reasons are currently recorded.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <HeroCards />

      <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Last Canonical Decision</CardTitle>
                <p className="text-xs text-text-muted pt-1">DecisionEnvelope-backed only.</p>
              </div>
              <ScrollText className="h-4 w-4 text-text-muted" />
            </div>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {latestCanonical ? (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="success">{latestCanonical.action.toUpperCase()}</Badge>
                  <span className="text-text-primary font-medium">{latestCanonical.token}</span>
                  <span className="text-text-muted tabular-nums">{latestCanonical.confidence.toFixed(2)}</span>
                </div>
                <p className="text-text-secondary">{latestCanonical.reasonClass ?? 'No reason class recorded.'}</p>
                <p className="text-xs text-text-muted">
                  {relativeTime(latestCanonical.timestamp)} · provenance {kpiProvenanceLabel(latestCanonical.provenanceKind)}
                </p>
              </>
            ) : (
              <EmptyState message="No canonical decision rows are available yet" />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Incident Summary</CardTitle>
                <p className="text-xs text-text-muted pt-1">Open incidents and recovery posture.</p>
              </div>
              <Clock className="h-4 w-4 text-text-muted" />
            </div>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>Open alerts: {openAlerts.length}</p>
            <p>Latest convergence: {restartAlerts?.summary.lastSuccessfulRestartConvergenceAt ? relativeTime(restartAlerts.summary.lastSuccessfulRestartConvergenceAt) : '—'}</p>
            <p>Latest notification: {restartAlerts?.summary.latestNotificationStatus?.toUpperCase() ?? '—'}</p>
            <p className="text-xs text-text-muted">Recovery route carries the detailed incident replay.</p>
          </CardContent>
        </Card>
      </div>

      <ActivitySection />

      <div className="rounded border border-border-subtle bg-bg-surface-hover/30 p-3 text-xs text-text-muted">
        {controlStatus?.restart?.required ? 'Restart required' : 'Restart not required'} · {controlStatus?.liveControl?.mode ?? 'unknown'} mode · Surface labels remain explicit and non-authoritative.
      </div>
    </div>
  );
}
