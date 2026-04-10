'use client';

import { useHealth } from '@/hooks/use-health';
import { useSummary } from '@/hooks/use-summary';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { LoadingCard } from '@/components/shared/loading-card';
import { ErrorCard } from '@/components/shared/error-card';
import { formatUptime, pct } from '@/lib/utils';
import { kpiProvenanceLabel } from '@/lib/kpi-provenance';
import { Shield, Zap, Database, Heart } from 'lucide-react';

export function HeroCards() {
  const { data: health, isLoading: hLoad, error: hErr, refetch: hRefetch } = useHealth();
  const { data: summary, isLoading: sLoad } = useSummary();

  if (hLoad || sLoad) {
    return (
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <LoadingCard key={i} />
        ))}
      </div>
    );
  }

  if (hErr) {
    return (
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        <ErrorCard message="Failed to load system health" onRetry={() => hRefetch()} />
      </div>
    );
  }

  const riskScore = summary?.riskScore ?? 0;
  const chaosRate = summary?.chaosPassRate ?? 0;
  const dataQuality = summary?.dataQuality ?? 0;
  const mp = summary?.metricProvenance;

  return (
    <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>System Health</CardTitle>
            <Heart className="h-4 w-4 text-text-muted" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-baseline gap-2">
            <span
              className={`text-2xl font-bold ${
                health?.status === 'OK'
                  ? 'text-accent-success'
                  : health?.status === 'DEGRADED'
                    ? 'text-accent-warning'
                    : 'text-accent-danger'
              }`}
            >
              {health?.status}
            </span>
          </div>
          <div className="mt-2 flex items-center gap-3 text-xs text-text-muted">
            <span>Uptime: {health ? formatUptime(health.uptimeMs) : '--'}</span>
            <span>v{health?.version}</span>
          </div>
          {health?.killSwitch?.halted && (
            <div className="mt-2 rounded border border-accent-danger/30 bg-accent-danger/10 px-2 py-1 text-xs text-accent-danger">
              HALTED: {health.killSwitch.reason || 'Unknown'}
            </div>
          )}
          <p className="mt-1 text-[10px] uppercase tracking-wide text-text-muted">
            Surface: {kpiProvenanceLabel(health?.surfaceKind)}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Risk Score</CardTitle>
            <Shield className="h-4 w-4 text-text-muted" />
          </div>
        </CardHeader>
        <CardContent>
          <span
            className={`text-2xl font-bold ${
              riskScore > 0.7
                ? 'text-accent-danger'
                : riskScore > 0.4
                  ? 'text-accent-warning'
                  : 'text-accent-success'
            }`}
          >
            {riskScore.toFixed(2)}
          </span>
          <div className="mt-2 h-1.5 w-full rounded-full bg-border-subtle overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-700 ${
                riskScore > 0.7
                  ? 'bg-accent-danger'
                  : riskScore > 0.4
                    ? 'bg-accent-warning'
                    : 'bg-accent-success'
              }`}
              style={{ width: `${riskScore * 100}%` }}
            />
          </div>
          <p className="mt-1.5 text-xs text-text-muted">Governance exposure index</p>
          <p className="mt-1 text-[10px] uppercase tracking-wide text-text-muted">
            Metric: {kpiProvenanceLabel(mp?.riskScore)}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Chaos Pass Rate</CardTitle>
            <Zap className="h-4 w-4 text-text-muted" />
          </div>
        </CardHeader>
        <CardContent>
          <span
            className={`text-2xl font-bold ${
              chaosRate >= 0.9
                ? 'text-accent-success'
                : chaosRate >= 0.7
                  ? 'text-accent-warning'
                  : 'text-accent-danger'
            }`}
          >
            {pct(chaosRate)}
          </span>
          <div className="mt-2 h-1.5 w-full rounded-full bg-border-subtle overflow-hidden">
            <div
              className="h-full rounded-full bg-accent-cyan transition-all duration-700"
              style={{ width: `${chaosRate * 100}%` }}
            />
          </div>
          <p className="mt-1.5 text-xs text-text-muted">Chaos gate scenarios passing</p>
          <p className="mt-1 text-[10px] uppercase tracking-wide text-text-muted">
            Metric: {kpiProvenanceLabel(mp?.chaosPassRate)}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Data Quality</CardTitle>
            <Database className="h-4 w-4 text-text-muted" />
          </div>
        </CardHeader>
        <CardContent>
          <span className="text-2xl font-bold text-accent-cyan">{pct(dataQuality)}</span>
          <div className="mt-2 h-1.5 w-full rounded-full bg-border-subtle overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-700 ${
                dataQuality >= 0.8
                  ? 'bg-accent-success'
                  : dataQuality >= 0.5
                    ? 'bg-accent-warning'
                    : 'bg-accent-danger'
              }`}
              style={{ width: `${dataQuality * 100}%` }}
            />
          </div>
          <p className="mt-1.5 text-xs text-text-muted">Healthy adapters ratio</p>
          <p className="mt-1 text-[10px] uppercase tracking-wide text-text-muted">
            Metric: {kpiProvenanceLabel(mp?.dataQuality)}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
