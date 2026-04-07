'use client';

import { useAdapters } from '@/hooks/use-adapters';
import { useDecisionAdvisory } from '@/hooks/use-decision-advisory';
import { useDecisions } from '@/hooks/use-decisions';
import { useMetrics } from '@/hooks/use-metrics';
import { AdapterHealthTable } from './adapter-health-table';
import { DecisionTimeline } from './decision-timeline';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { LoadingCard } from '@/components/shared/loading-card';
import { ErrorCard } from '@/components/shared/error-card';
import { kpiProvenanceLabel } from '@/lib/kpi-provenance';
import { BarChart3, Gauge, Layers3, RefreshCw, Cpu } from 'lucide-react';

const DEFERRED_GROUPS = [
  'casebook',
  'knowledge',
  'priors',
  'playbooks',
  'optimization_memory',
  'deep_infra_controls',
  'deployment_internal_control_surfaces',
  'large_model_orchestration_workbench',
] as const;

export function AdvancedPage() {
  const { data: metrics, isLoading: metricsLoading, error: metricsError, refetch: refetchMetrics } = useMetrics();
  const { isLoading: adaptersLoading, error: adaptersError, refetch: refetchAdapters } = useAdapters();
  const { data: decisions, isLoading: decisionsLoading } = useDecisions(5);

  const latestDecisionId = decisions?.decisions?.[0]?.id;
  const decisionAdvisory = useDecisionAdvisory(latestDecisionId);

  if (metricsLoading || adaptersLoading || decisionsLoading || decisionAdvisory.isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">Advanced</h2>
          <p className="text-sm text-text-muted">Secondary operational detail and diagnostics</p>
        </div>
        <LoadingCard />
        <LoadingCard />
      </div>
    );
  }

  if (metricsError) {
    return <ErrorCard message="Failed to load advanced metrics" onRetry={() => refetchMetrics()} />;
  }

  if (adaptersError) {
    return <ErrorCard message="Failed to load advanced adapters" onRetry={() => refetchAdapters()} />;
  }

  const latencyKeys = metrics?.p95LatencyMs ? Object.keys(metrics.p95LatencyMs) : [];
  const advisory = decisionAdvisory.data;
  const auditCount = advisory?.audits.length ?? 0;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-text-primary">Advanced</h2>
        <p className="text-sm text-text-muted">
          Adapter inspector, AI sources, legacy projection feed, and deferred operational groups.
        </p>
      </div>

      <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Diagnostics</CardTitle>
                <p className="text-xs text-text-muted pt-1">Secondary performance and surface provenance.</p>
              </div>
              <Gauge className="h-4 w-4 text-text-muted" />
            </div>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-text-muted">Surface</span>
              <span className="text-text-secondary">{kpiProvenanceLabel(metrics?.surfaceKind)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-muted">Latency series</span>
              <span className="text-text-secondary">{latencyKeys.length} metrics</span>
            </div>
            {latencyKeys.length > 0 && (
              <div className="space-y-2">
                {latencyKeys.map((key) => (
                  <div key={key} className="flex items-center justify-between rounded border border-border-subtle bg-bg-surface-hover/30 px-3 py-2">
                    <span className="text-sm text-text-secondary">{key}</span>
                    <span className="text-sm text-text-primary tabular-nums">{metrics?.p95LatencyMs?.[key] ?? 0}ms</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>AI Sources</CardTitle>
                <p className="text-xs text-text-muted pt-1">Advisory model and audit trail only, not canonical decision truth.</p>
              </div>
              <Cpu className="h-4 w-4 text-text-muted" />
            </div>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {advisory?.enabled && advisory.advisory ? (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="success">ENABLED</Badge>
                  <span className="text-text-secondary">{advisory.advisory.provider}</span>
                  <span className="text-text-secondary">{advisory.advisory.model}</span>
                  <span className="text-text-secondary">confidence {advisory.advisory.confidence.toFixed(2)}</span>
                </div>
                <p className="text-text-secondary">{advisory.advisory.summary}</p>
                {advisory.advisorySecondary && (
                  <p className="text-xs text-text-muted">Secondary model: {advisory.advisorySecondary.provider} / {advisory.advisorySecondary.model}</p>
                )}
              </>
            ) : (
              <p className="text-text-muted">Advisory model output is not enabled for the current trace.</p>
            )}
            <div className="rounded border border-border-subtle bg-bg-surface-hover/30 p-3 text-xs text-text-muted space-y-1">
              <p>Trace: {advisory?.traceId ?? latestDecisionId ?? '—'}</p>
              <p>Audits: {auditCount}</p>
              {advisory?.audits?.map((audit) => (
                <p key={`${audit.traceId}-${audit.provider}-${audit.model}`}>
                  {audit.provider} / {audit.model} · {audit.latencyMs}ms · {audit.success ? 'success' : 'failed'}
                </p>
              ))}
            </div>
            <Button type="button" variant="ghost" size="sm" onClick={() => decisionAdvisory.refetch()}>
              <RefreshCw className="h-4 w-4" />
              Refresh advisory
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-text-primary">Adapter Inspector</h3>
            <BarChart3 className="h-4 w-4 text-text-muted" />
          </div>
          <AdapterHealthTable />
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Deferred Groups</CardTitle>
                <p className="text-xs text-text-muted pt-1">Not active in V1; shown explicitly as deferred.</p>
              </div>
              <Layers3 className="h-4 w-4 text-text-muted" />
            </div>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {DEFERRED_GROUPS.map((group) => (
              <Badge key={group} variant="default">
                {group}
              </Badge>
            ))}
          </CardContent>
        </Card>
      </div>

      <DecisionTimeline />
      <p className="text-xs text-text-muted">
        Legacy projections are intentionally separated from the canonical journal route.
      </p>
    </div>
  );
}
