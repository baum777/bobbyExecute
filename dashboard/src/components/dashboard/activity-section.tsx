'use client';

import { useSummary } from '@/hooks/use-summary';
import { useMetrics } from '@/hooks/use-metrics';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { LoadingCard } from '@/components/shared/loading-card';
import { LatencyBar } from '@/components/shared/latency-bar';
import { relativeTime } from '@/lib/utils';
import { kpiProvenanceLabel } from '@/lib/kpi-provenance';
import { TrendingUp, Timer } from 'lucide-react';

export function ActivitySection() {
  const { data: summary, isLoading: sLoad } = useSummary();
  const { data: metrics, isLoading: mLoad } = useMetrics();

  if (sLoad || mLoad) {
    return (
      <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
        <LoadingCard />
        <LoadingCard />
      </div>
    );
  }

  const latencyEntries = metrics?.p95LatencyMs
    ? Object.entries(metrics.p95LatencyMs)
    : [];
  const mp = summary?.metricProvenance;

  return (
    <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Trades Today</CardTitle>
            <TrendingUp className="h-4 w-4 text-text-muted" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-baseline gap-3">
            <span className="text-3xl font-bold text-accent-cyan tabular-nums">
              {summary?.tradesToday ?? 0}
            </span>
            <span className="text-sm text-text-muted">executed</span>
          </div>
          {summary?.lastDecisionAt && (
            <p className="mt-2 text-xs text-text-muted">
              Last decision: {relativeTime(summary.lastDecisionAt)}
            </p>
          )}
          <p className="mt-2 text-[10px] uppercase tracking-wide text-text-muted">
            Trades metric: {kpiProvenanceLabel(mp?.tradesToday)} · Last activity:{' '}
            {kpiProvenanceLabel(mp?.lastDecisionAt)}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>P95 Latency</CardTitle>
            <Timer className="h-4 w-4 text-text-muted" />
          </div>
        </CardHeader>
        <CardContent>
          {latencyEntries.length === 0 ? (
            <p className="text-sm text-text-muted">No latency data</p>
          ) : (
            <div className="space-y-2.5">
              {latencyEntries.map(([key, value]) => (
                <LatencyBar key={key} label={key} value={value} />
              ))}
            </div>
          )}
          <p className="mt-2 text-[10px] uppercase tracking-wide text-text-muted">Metric: wired</p>
        </CardContent>
      </Card>
    </div>
  );
}
