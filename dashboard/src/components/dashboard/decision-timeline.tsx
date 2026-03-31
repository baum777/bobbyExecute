'use client';

import { useDecisions } from '@/hooks/use-decisions';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { DecisionActionBadge } from '@/components/shared/status-badge';
import { LoadingCard } from '@/components/shared/loading-card';
import { EmptyState } from '@/components/shared/empty-state';
import { ErrorCard } from '@/components/shared/error-card';
import { formatTimestamp } from '@/lib/utils';
import { ScrollText } from 'lucide-react';

export function DecisionTimeline() {
  const { data, isLoading, error, refetch } = useDecisions(15);

  if (isLoading) return <LoadingCard className="min-h-[200px]" />;
  if (error) return <ErrorCard message="Failed to load decisions" onRetry={() => refetch()} />;

  const decisions = data?.decisions ?? [];
  if (decisions.length === 0) return <EmptyState message="No decisions yet" />;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Recent Decisions</CardTitle>
          <ScrollText className="h-4 w-4 text-text-muted" />
        </div>
        <p className="text-[10px] text-text-muted pt-1">
          Derived projection from action logs via GET /kpi/decisions — not a standalone canonical decision record.
        </p>
      </CardHeader>
      <CardContent>
        <div className="space-y-0 max-h-[380px] overflow-y-auto pr-1">
          {decisions.map((d) => (
            <div
              key={d.id}
              className="flex items-start gap-3 border-b border-border-subtle/50 py-3 last:border-0 animate-fade-in"
            >
              <div className="shrink-0 mt-0.5">
                <div
                  className={`h-2 w-2 rounded-full ${
                    d.action === 'allow'
                      ? 'bg-accent-success'
                      : d.action === 'block'
                        ? 'bg-accent-danger'
                        : 'bg-accent-warning'
                  }`}
                />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <DecisionActionBadge action={d.action} />
                  <span className="text-sm font-medium text-text-primary">{d.token}</span>
                  <span className="text-xs text-text-muted tabular-nums">
                    {d.confidence.toFixed(2)}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {d.reasons.slice(0, 2).map((r, i) => (
                    <Badge key={i} variant="default" className="text-[10px]">
                      {r}
                    </Badge>
                  ))}
                  {d.reasons.length > 2 && (
                    <Badge variant="default" className="text-[10px]">
                      +{d.reasons.length - 2}
                    </Badge>
                  )}
                </div>
              </div>

              <span className="text-xs text-text-muted shrink-0 tabular-nums">
                {formatTimestamp(d.timestamp)}
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
