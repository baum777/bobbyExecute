'use client';

import { useAdapters } from '@/hooks/use-adapters';
import { useDecisionAdvisory } from '@/hooks/use-decision-advisory';
import { useDecisions } from '@/hooks/use-decisions';
import { useMetrics } from '@/hooks/use-metrics';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/shared/empty-state';
import { LoadingCard } from '@/components/shared/loading-card';
import { ErrorCard } from '@/components/shared/error-card';
import { AdapterStatusBadge, DecisionActionBadge } from '@/components/shared/status-badge';
import { getFirstCanonicalDecision, getLegacyProjectionDecisionRows } from '@/lib/decision-provenance';
import { kpiProvenanceLabel } from '@/lib/kpi-provenance';
import { formatTimestamp, relativeTime } from '@/lib/utils';
import { Gauge, Layers3, RefreshCw, Cpu, ScrollText, Plug } from 'lucide-react';

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
  const { data: adapters, isLoading: adaptersLoading, error: adaptersError, refetch: refetchAdapters } = useAdapters();
  const { data: decisions, isLoading: decisionsLoading } = useDecisions(5);

  const decisionRows = decisions?.decisions ?? [];
  const latestDecisionId = getFirstCanonicalDecision(decisionRows)?.id;
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
  const adapterRows = adapters?.adapters ?? [];
  const legacyProjectionRows = getLegacyProjectionDecisionRows(decisionRows);

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
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Adapter Inspector</CardTitle>
                <p className="text-xs text-text-muted pt-1">Secondary operational detail only.</p>
              </div>
              <Plug className="h-4 w-4 text-text-muted" />
            </div>
          </CardHeader>
          <CardContent>
            {adapterRows.length === 0 ? (
              <EmptyState message="No adapters configured" />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border-subtle text-xs text-text-muted">
                      <th className="pb-2 text-left font-medium">Adapter</th>
                      <th className="pb-2 text-left font-medium">Status</th>
                      <th className="pb-2 text-right font-medium">Latency</th>
                      <th className="pb-2 text-right font-medium hidden sm:table-cell">Last OK</th>
                    </tr>
                  </thead>
                  <tbody>
                    {adapterRows.map((adapter) => (
                      <tr key={adapter.id} className="border-b border-border-subtle/50 last:border-0 hover:bg-bg-surface-hover transition-colors">
                        <td className="py-2.5 font-medium text-text-primary">{adapter.id}</td>
                        <td className="py-2.5">
                          <AdapterStatusBadge status={adapter.status} />
                        </td>
                        <td className="py-2.5 text-right tabular-nums text-text-secondary">{adapter.latencyMs > 0 ? `${adapter.latencyMs}ms` : '--'}</td>
                        <td className="py-2.5 text-right text-text-muted hidden sm:table-cell">{relativeTime(adapter.lastSuccessAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <details className="rounded-lg border border-border-default bg-bg-surface p-4">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-text-secondary">Deferred Groups</p>
              <p className="text-xs text-text-muted pt-1">Not active in V1; shown explicitly as deferred.</p>
            </div>
            <Layers3 className="h-4 w-4 text-text-muted" />
          </summary>
          <div className="flex flex-wrap gap-2 pt-3">
            {DEFERRED_GROUPS.map((group) => (
              <Badge key={group} variant="default">
                {group}
              </Badge>
            ))}
          </div>
        </details>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Legacy Projection Feed</CardTitle>
              <p className="text-xs text-text-muted pt-1">Action-log projections only. This is disclosed secondary data.</p>
            </div>
            <ScrollText className="h-4 w-4 text-text-muted" />
          </div>
        </CardHeader>
        <CardContent>
          {legacyProjectionRows.length === 0 ? (
            <EmptyState message="No legacy projections yet" />
          ) : (
            <div className="space-y-0 max-h-[380px] overflow-y-auto pr-1">
              {legacyProjectionRows.map((decision) => (
                <div
                  key={decision.id}
                  className="flex items-start gap-3 border-b border-border-subtle/50 py-3 last:border-0 animate-fade-in"
                >
                  <div className="shrink-0 mt-0.5">
                    <div
                      className={`h-2 w-2 rounded-full ${
                        decision.action === 'allow'
                          ? 'bg-accent-success'
                          : decision.action === 'block'
                            ? 'bg-accent-danger'
                            : 'bg-accent-warning'
                      }`}
                    />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <DecisionActionBadge action={decision.action} />
                      <span className="text-sm font-medium text-text-primary">{decision.token}</span>
                      <span className="text-xs text-text-muted tabular-nums">{decision.confidence.toFixed(2)}</span>
                      <Badge variant="default" className="text-[9px] px-1.5 py-0">
                        {kpiProvenanceLabel(decision.provenanceKind)}
                      </Badge>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {decision.reasons.slice(0, 2).map((reason, index) => (
                        <Badge key={index} variant="default" className="text-[10px]">
                          {reason}
                        </Badge>
                      ))}
                      {decision.reasons.length > 2 && (
                        <Badge variant="default" className="text-[10px]">
                          +{decision.reasons.length - 2}
                        </Badge>
                      )}
                    </div>
                  </div>

                  <span className="text-xs text-text-muted shrink-0 tabular-nums">{formatTimestamp(decision.timestamp)}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      <p className="text-xs text-text-muted">
        Legacy projections are intentionally separated from the canonical journal route.
      </p>
    </div>
  );
}
