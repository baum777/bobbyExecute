'use client';

import { useControlStatus } from '@/hooks/use-control';
import { useSummary } from '@/hooks/use-summary';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { LoadingCard } from '@/components/shared/loading-card';
import { ErrorCard } from '@/components/shared/error-card';
import { relativeTime } from '@/lib/utils';
import { kpiProvenanceLabel } from '@/lib/kpi-provenance';
import { CanonicalDecisionHistory } from './canonical-decision-history';
import { ScrollText, ShieldAlert, TrendingUp } from 'lucide-react';

export function JournalPage() {
  const { data: summary, isLoading: summaryLoading, error: summaryError, refetch: refetchSummary } = useSummary();
  const { data: controlStatus, isLoading: controlLoading, error: controlError, refetch: refetchControl } = useControlStatus();

  if (summaryLoading || controlLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">Journal</h2>
          <p className="text-sm text-text-muted">Trade history, control actions, and canonical decision history</p>
        </div>
        <LoadingCard />
        <LoadingCard />
      </div>
    );
  }

  if (controlError) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">Journal</h2>
        </div>
        <ErrorCard message="Failed to load journal controls" onRetry={() => refetchControl()} />
      </div>
    );
  }

  if (summaryError) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">Journal</h2>
        </div>
        <ErrorCard message="Failed to load journal trade history" onRetry={() => refetchSummary()} />
      </div>
    );
  }

  const killSwitch = controlStatus?.killSwitch;
  const restart = controlStatus?.restart;
  const runtimeConfig = controlStatus?.runtimeConfig ?? controlStatus?.controlView;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-text-primary">Journal</h2>
        <p className="text-sm text-text-muted">
          Trade history, control actions, and canonical decision history stay separated on this route.
        </p>
      </div>

      <div className="grid gap-4 grid-cols-1 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Trade History</CardTitle>
              <TrendingUp className="h-4 w-4 text-text-muted" />
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-accent-cyan tabular-nums">{summary?.tradesToday ?? 0}</span>
              <span className="text-sm text-text-muted">trades today</span>
            </div>
            <p className="text-sm text-text-secondary">Bot status: {summary?.botStatus?.toUpperCase() ?? '—'}</p>
            {summary?.lastDecisionAt && <p className="text-xs text-text-muted">Last activity: {relativeTime(summary.lastDecisionAt)}</p>}
            <p className="text-[10px] uppercase tracking-wide text-text-muted">
              Surface: {kpiProvenanceLabel(summary?.metricProvenance?.tradesToday)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Control Actions</CardTitle>
              <ShieldAlert className="h-4 w-4 text-text-muted" />
            </div>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-text-muted">Kill switch</span>
              <Badge variant={killSwitch?.halted ? 'danger' : 'success'}>{killSwitch?.halted ? 'HALTED' : 'ACTIVE'}</Badge>
            </div>
            <div className="flex justify-between">
              <span className="text-text-muted">Restart state</span>
              <span className="text-text-secondary">
                {restart?.inProgress ? 'IN PROGRESS' : restart?.required ? 'REQUIRED' : 'READY'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-muted">Runtime mode</span>
              <span className="text-text-secondary">{runtimeConfig?.appliedMode ?? '—'}</span>
            </div>
            <p className="text-[10px] uppercase tracking-wide text-text-muted">
              Control status remains a separate operational surface.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Journal Context</CardTitle>
              <ScrollText className="h-4 w-4 text-text-muted" />
            </div>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p className="text-text-secondary">This route holds filters, detail, and export on the canonical history surface.</p>
            <p className="text-xs text-text-muted">
              Decision history stays decisionEnvelope-backed and filtered away from legacy projections.
            </p>
          </CardContent>
        </Card>
      </div>

      <CanonicalDecisionHistory />
    </div>
  );
}
