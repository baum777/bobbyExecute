'use client';

import { useState } from 'react';
import { useAdapters } from '@/hooks/use-adapters';
import type { Adapter, AdapterStatus } from '@/types/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { AdapterStatusBadge } from '@/components/shared/status-badge';
import { LoadingCard } from '@/components/shared/loading-card';
import { ErrorCard } from '@/components/shared/error-card';
import { EmptyState } from '@/components/shared/empty-state';
import { LatencyBar } from '@/components/shared/latency-bar';
import { relativeTime, formatTimestampFull } from '@/lib/utils';
import { Search, X, AlertCircle, Clock, Wifi, WifiOff } from 'lucide-react';

const STATUS_FILTERS: Array<AdapterStatus | 'all'> = ['all', 'healthy', 'degraded', 'down'];

export default function AdaptersPage() {
  const { data, isLoading, error, refetch } = useAdapters();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<AdapterStatus | 'all'>('all');
  const [selected, setSelected] = useState<Adapter | null>(null);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">Adapters</h2>
          <p className="text-sm text-text-muted">Data source health and diagnostics</p>
        </div>
        <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <LoadingCard key={i} />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">Adapters</h2>
        </div>
        <ErrorCard message="Failed to load adapter data" onRetry={() => refetch()} />
      </div>
    );
  }

  const adapters = data?.adapters ?? [];

  const filtered = adapters.filter((a) => {
    if (statusFilter !== 'all' && a.status !== statusFilter) return false;
    if (search && !a.id.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const counts = {
    healthy: adapters.filter((a) => a.status === 'healthy').length,
    degraded: adapters.filter((a) => a.status === 'degraded').length,
    down: adapters.filter((a) => a.status === 'down').length,
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-text-primary">Adapters</h2>
        <p className="text-sm text-text-muted">
          {adapters.length} adapters &middot; {counts.healthy} healthy &middot;{' '}
          {counts.degraded} degraded &middot; {counts.down} down
        </p>
      </div>

      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
          <Input
            placeholder="Search adapters..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {STATUS_FILTERS.map((s) => (
            <Button
              key={s}
              variant={statusFilter === s ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setStatusFilter(s)}
            >
              {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
              {s !== 'all' && (
                <span className="ml-1 text-xs opacity-60">{counts[s]}</span>
              )}
            </Button>
          ))}
        </div>
      </div>

      <div className="flex gap-6">
        <div className="flex-1">
          {filtered.length === 0 ? (
            <EmptyState message="No adapters match your filters" />
          ) : (
            <div className="grid gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
              {filtered.map((a) => (
                <Card
                  key={a.id}
                  className={`cursor-pointer transition-all hover:border-accent-cyan/40 ${
                    selected?.id === a.id ? 'border-accent-cyan ring-1 ring-accent-cyan/20' : ''
                  }`}
                  onClick={() => setSelected(a)}
                >
                  <CardContent>
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm font-semibold text-text-primary">{a.id}</span>
                      <AdapterStatusBadge status={a.status} />
                    </div>
                    <div className="space-y-2">
                      <LatencyBar label="p95" value={a.latencyMs} />
                      <div className="flex items-center justify-between text-xs text-text-muted">
                        <span>Last OK: {relativeTime(a.lastSuccessAt)}</span>
                        {a.consecutiveFailures > 0 && (
                          <span className="text-accent-danger">
                            {a.consecutiveFailures} fails
                          </span>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>

        {selected && (
          <div className="hidden lg:block w-80 shrink-0 animate-slide-in">
            <Card className="sticky top-20 border-accent-cyan/30">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-text-primary font-semibold">
                    {selected.id}
                  </CardTitle>
                  <Button variant="ghost" size="sm" onClick={() => setSelected(null)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-2">
                  {selected.status === 'healthy' ? (
                    <Wifi className="h-4 w-4 text-accent-success" />
                  ) : (
                    <WifiOff className="h-4 w-4 text-accent-danger" />
                  )}
                  <AdapterStatusBadge status={selected.status} />
                </div>

                <div className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-text-muted">Latency</span>
                    <span className="text-text-primary tabular-nums">
                      {selected.latencyMs > 0 ? `${selected.latencyMs}ms` : '--'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-muted">Last Success</span>
                    <span className="text-text-secondary text-xs">
                      {formatTimestampFull(selected.lastSuccessAt)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-muted">Consecutive Failures</span>
                    <span
                      className={
                        selected.consecutiveFailures > 0
                          ? 'text-accent-danger font-medium'
                          : 'text-text-secondary'
                      }
                    >
                      {selected.consecutiveFailures}
                    </span>
                  </div>
                </div>

                {selected.status === 'degraded' && (
                  <div className="rounded border border-accent-warning/30 bg-accent-warning/5 p-3">
                    <div className="flex items-start gap-2">
                      <AlertCircle className="h-4 w-4 text-accent-warning shrink-0 mt-0.5" />
                      <div>
                        <p className="text-xs font-medium text-accent-warning">Degraded</p>
                        <p className="text-xs text-text-muted mt-1">
                          Data may be stale (&gt;15s freshness). Circuit breaker is monitoring.
                          Check upstream provider status.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {selected.status === 'down' && (
                  <div className="rounded border border-accent-danger/30 bg-accent-danger/5 p-3">
                    <div className="flex items-start gap-2">
                      <AlertCircle className="h-4 w-4 text-accent-danger shrink-0 mt-0.5" />
                      <div>
                        <p className="text-xs font-medium text-accent-danger">Down</p>
                        <p className="text-xs text-text-muted mt-1">
                          Circuit breaker is open after {selected.consecutiveFailures} consecutive
                          failures. Adapter is excluded from data aggregation. Review provider
                          health and consider manual recovery.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                <div className="pt-2 border-t border-border-subtle">
                  <p className="text-xs text-text-muted flex items-center gap-1.5">
                    <Clock className="h-3 w-3" />
                    Source: Bot API /kpi/adapters
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
