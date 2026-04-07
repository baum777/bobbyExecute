'use client';

import { useMemo, useState } from 'react';
import { useDecisions } from '@/hooks/use-decisions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/shared/empty-state';
import { ErrorCard } from '@/components/shared/error-card';
import { LoadingCard } from '@/components/shared/loading-card';
import { DecisionActionBadge } from '@/components/shared/status-badge';
import { formatTimestamp } from '@/lib/utils';
import { kpiProvenanceLabel } from '@/lib/kpi-provenance';
import type { DecisionAction } from '@/types/api';
import { Download, ScrollText } from 'lucide-react';

const ACTION_FILTERS: Array<DecisionAction | 'all'> = ['all', 'allow', 'block', 'abort'];

export function CanonicalDecisionHistory() {
  const { data, isLoading, error, refetch } = useDecisions(50);
  const [actionFilter, setActionFilter] = useState<DecisionAction | 'all'>('all');

  const canonicalDecisions = useMemo(
    () => (data?.decisions ?? []).filter((decision) => decision.provenanceKind === 'canonical'),
    [data]
  );

  const visibleDecisions = useMemo(
    () =>
      actionFilter === 'all'
        ? canonicalDecisions
        : canonicalDecisions.filter((decision) => decision.action === actionFilter),
    [actionFilter, canonicalDecisions]
  );

  const selectedDecision = visibleDecisions[0];

  const exportCanonicalRows = () => {
    if (typeof window === 'undefined' || visibleDecisions.length === 0) {
      return;
    }

    const payload = JSON.stringify(visibleDecisions, null, 2);
    if (window.navigator.clipboard?.writeText) {
      void window.navigator.clipboard.writeText(payload);
      return;
    }

    const blob = new Blob([payload], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'canonical-decision-history.json';
    anchor.click();
    window.URL.revokeObjectURL(url);
  };

  if (isLoading) {
    return <LoadingCard className="min-h-[220px]" />;
  }

  if (error) {
    return <ErrorCard message="Failed to load canonical decision history" onRetry={() => refetch()} />;
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle>Canonical Decision History</CardTitle>
            <p className="text-xs text-text-muted pt-1">
              DecisionEnvelope-backed runtime cycle history only. Legacy projections stay out of this surface.
            </p>
          </div>
          <ScrollText className="h-4 w-4 text-text-muted" />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          {ACTION_FILTERS.map((value) => (
            <Button
              key={value}
              type="button"
              size="sm"
              variant={actionFilter === value ? 'default' : 'ghost'}
              onClick={() => setActionFilter(value)}
            >
              {value === 'all' ? 'All actions' : value.toUpperCase()}
            </Button>
          ))}
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={visibleDecisions.length === 0}
            onClick={exportCanonicalRows}
          >
            <Download className="h-4 w-4" />
            Export
          </Button>
        </div>

        {visibleDecisions.length === 0 ? (
          <EmptyState message="No canonical decision rows match the current filter" />
        ) : (
          <div className="space-y-3">
            <div className="space-y-2 rounded border border-border-subtle bg-bg-surface-hover/30 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <DecisionActionBadge action={selectedDecision.action} />
                <Badge variant="default" className="text-[9px] px-1.5 py-0">
                  {kpiProvenanceLabel(selectedDecision.provenanceKind)}
                </Badge>
                <span className="text-sm font-medium text-text-primary">{selectedDecision.token}</span>
                <span className="text-xs text-text-muted tabular-nums">
                  confidence {selectedDecision.confidence.toFixed(2)}
                </span>
              </div>
              <p className="text-sm text-text-secondary">
                {selectedDecision.reasonClass ?? 'No canonical reason class recorded.'}
              </p>
              <div className="grid gap-2 text-xs text-text-muted md:grid-cols-2 xl:grid-cols-4">
                <div>Timestamp: {formatTimestamp(selectedDecision.timestamp)}</div>
                <div>Source: {selectedDecision.source}</div>
                <div>Decision hash: {selectedDecision.decisionHash ?? '—'}</div>
                <div>Execution mode: {selectedDecision.executionMode ?? '—'}</div>
              </div>
            </div>

            <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
              {visibleDecisions.map((decision) => (
                <div
                  key={decision.id}
                  className="flex items-start gap-3 rounded border border-border-subtle/60 bg-bg-surface-hover/20 px-3 py-2"
                >
                  <DecisionActionBadge action={decision.action} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-text-primary">{decision.token}</span>
                      <span className="text-xs text-text-muted">{formatTimestamp(decision.timestamp)}</span>
                    </div>
                    <p className="text-xs text-text-muted">
                      {decision.reasons.length > 0 ? decision.reasons.join(' · ') : 'No reasons recorded.'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
