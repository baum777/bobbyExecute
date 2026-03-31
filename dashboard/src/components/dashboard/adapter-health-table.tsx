'use client';

import { useAdapters } from '@/hooks/use-adapters';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { AdapterStatusBadge } from '@/components/shared/status-badge';
import { LoadingCard } from '@/components/shared/loading-card';
import { EmptyState } from '@/components/shared/empty-state';
import { ErrorCard } from '@/components/shared/error-card';
import { relativeTime } from '@/lib/utils';
import { Plug } from 'lucide-react';

export function AdapterHealthTable() {
  const { data, isLoading, error, refetch } = useAdapters();

  if (isLoading) return <LoadingCard className="min-h-[200px]" />;
  if (error) return <ErrorCard message="Failed to load adapter data" onRetry={() => refetch()} />;

  const adapters = data?.adapters ?? [];
  if (adapters.length === 0) return <EmptyState message="No adapters configured" />;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Adapter Health</CardTitle>
          <Plug className="h-4 w-4 text-text-muted" />
        </div>
        <p className="text-[10px] uppercase tracking-wide text-text-muted pt-1">
          GET /kpi/adapters — wired when circuit breaker is active; else derived from runtime snapshot or default
          placeholders
        </p>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border-subtle text-xs text-text-muted">
                <th className="pb-2 text-left font-medium">Adapter</th>
                <th className="pb-2 text-left font-medium">Status</th>
                <th className="pb-2 text-right font-medium">Latency</th>
                <th className="pb-2 text-right font-medium hidden sm:table-cell">Last OK</th>
                <th className="pb-2 text-right font-medium hidden md:table-cell">Fails</th>
              </tr>
            </thead>
            <tbody>
              {adapters.map((a) => (
                <tr
                  key={a.id}
                  className="border-b border-border-subtle/50 last:border-0 hover:bg-bg-surface-hover transition-colors"
                >
                  <td className="py-2.5 font-medium text-text-primary">{a.id}</td>
                  <td className="py-2.5">
                    <AdapterStatusBadge status={a.status} />
                  </td>
                  <td className="py-2.5 text-right tabular-nums text-text-secondary">
                    {a.latencyMs > 0 ? `${a.latencyMs}ms` : '--'}
                  </td>
                  <td className="py-2.5 text-right text-text-muted hidden sm:table-cell">
                    {relativeTime(a.lastSuccessAt)}
                  </td>
                  <td className="py-2.5 text-right hidden md:table-cell">
                    {a.consecutiveFailures > 0 ? (
                      <span className="text-accent-danger font-medium">
                        {a.consecutiveFailures}
                      </span>
                    ) : (
                      <span className="text-text-muted">0</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
