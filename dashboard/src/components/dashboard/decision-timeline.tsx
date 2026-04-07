'use client';

import { useMemo } from 'react';
import { useDecisions } from '@/hooks/use-decisions';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { DecisionActionBadge } from '@/components/shared/status-badge';
import { LoadingCard } from '@/components/shared/loading-card';
import { EmptyState } from '@/components/shared/empty-state';
import { ErrorCard } from '@/components/shared/error-card';
import { formatTimestamp } from '@/lib/utils';
import { kpiProvenanceLabel } from '@/lib/kpi-provenance';
import { ScrollText } from 'lucide-react';

export function DecisionTimeline() {
  const { data, isLoading, error, refetch } = useDecisions(20);

  const projectionRows = useMemo(
    () => (data?.decisions ?? []).filter((decision) => decision.provenanceKind === 'legacy_projection'),
    [data]
  );

  if (isLoading) return <LoadingCard className="min-h-[200px]" />;
  if (error) return <ErrorCard message="Failed to load legacy decision projections" onRetry={() => refetch()} />;

  if (projectionRows.length === 0) return <EmptyState message="No legacy projections yet" />;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Legacy Projection Feed</CardTitle>
          <ScrollText className="h-4 w-4 text-text-muted" />
        </div>
        <p className="text-[10px] text-text-muted pt-1">
          Action-log projections only. This is a disclosed secondary feed, not canonical decision history.
        </p>
      </CardHeader>
      <CardContent>
        <div className="space-y-0 max-h-[380px] overflow-y-auto pr-1">
          {projectionRows.map((decision) => (
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
      </CardContent>
    </Card>
  );
}
