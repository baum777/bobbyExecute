'use client';

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useDecisions } from '@/hooks/use-decisions';
import { api } from '@/lib/api';
import type { Decision, DecisionAction } from '@/types/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { DecisionActionBadge } from '@/components/shared/status-badge';
import { LoadingCard } from '@/components/shared/loading-card';
import { ErrorCard } from '@/components/shared/error-card';
import { EmptyState } from '@/components/shared/empty-state';
import { formatTimestampFull, formatTimestamp } from '@/lib/utils';
import { Search, X, Clock, FileText, Filter } from 'lucide-react';

const ACTION_FILTERS: Array<DecisionAction | 'all'> = ['all', 'allow', 'block', 'abort'];

export default function DecisionsPage() {
  const { data, isLoading, error, refetch } = useDecisions(200);
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState<DecisionAction | 'all'>('all');
  const [minConfidence, setMinConfidence] = useState(0);
  const [selected, setSelected] = useState<Decision | null>(null);

  const decisions = data?.decisions ?? [];

  const advisoryQuery = useQuery({
    queryKey: ['decision-advisory', selected?.id],
    queryFn: () => api.decisionAdvisory(selected!.id, false),
    enabled: Boolean(selected?.provenanceKind === 'canonical' && selected?.schemaVersion === 'decision.envelope.v3'),
    staleTime: 60_000,
  });

  const filtered = useMemo(() => {
    return decisions.filter((d) => {
      if (actionFilter !== 'all' && d.action !== actionFilter) return false;
      if (search && !d.token.toLowerCase().includes(search.toLowerCase())) return false;
      if (d.confidence < minConfidence) return false;
      return true;
    });
  }, [decisions, actionFilter, search, minConfidence]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">Decisions</h2>
          <p className="text-sm text-text-muted">Governance audit log</p>
        </div>
        {Array.from({ length: 5 }).map((_, i) => (
          <LoadingCard key={i} />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">Decisions</h2>
        </div>
        <ErrorCard message="Failed to load decision log" onRetry={() => refetch()} />
      </div>
    );
  }

  const counts = {
    allow: decisions.filter((d) => d.action === 'allow').length,
    block: decisions.filter((d) => d.action === 'block').length,
    abort: decisions.filter((d) => d.action === 'abort').length,
  };

  return (
    <div className="space-y-6">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">Decisions</h2>
          <p className="text-sm text-text-muted">
            {decisions.length} entries &middot; {counts.allow} allow &middot; {counts.block} block &middot;{' '}
            {counts.abort} abort
          </p>
          <p className="mt-1 text-xs text-text-muted max-w-3xl">
            Rows with <span className="font-medium text-text-secondary">canonical</span> come from runtime cycle
            summaries (decision envelope v3) when available; <span className="font-medium text-text-secondary">derived</span>{' '}
            rows are legacy action-log projections from the same endpoint.
          </p>
        </div>

      <div className="flex flex-col gap-3">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
            <Input
              placeholder="Search by token..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {ACTION_FILTERS.map((a) => (
              <Button
                key={a}
                variant={actionFilter === a ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setActionFilter(a)}
              >
                {a === 'all' ? 'All' : a.charAt(0).toUpperCase() + a.slice(1)}
                {a !== 'all' && (
                  <span className="ml-1 text-xs opacity-60">{counts[a]}</span>
                )}
              </Button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Filter className="h-3.5 w-3.5 text-text-muted" />
            <span className="text-xs text-text-muted">Min confidence:</span>
            <Input
              type="number"
              min={0}
              max={1}
              step={0.1}
              value={minConfidence}
              onChange={(e) => setMinConfidence(Number(e.target.value))}
              className="w-20 h-8 text-xs"
            />
          </div>
        </div>
      </div>

      <div className="flex gap-6">
        <div className="flex-1 min-w-0">
          {filtered.length === 0 ? (
            <EmptyState message="No decisions match your filters" />
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="max-h-[calc(100vh-280px)] overflow-y-auto">
                  {filtered.map((d) => (
                    <div
                      key={d.id}
                      className={`flex items-start gap-4 px-4 py-3.5 border-b border-border-subtle/50 cursor-pointer transition-colors hover:bg-bg-surface-hover ${
                        selected?.id === d.id ? 'bg-bg-surface-hover' : ''
                      }`}
                      onClick={() => setSelected(d)}
                    >
                      <div className="shrink-0 mt-1">
                        <div
                          className={`h-2.5 w-2.5 rounded-full ${
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
                            conf: {d.confidence.toFixed(2)}
                          </span>
                          <Badge variant="default" className="text-[9px] px-1.5 py-0">
                            {d.provenanceKind === 'canonical' ? 'canonical' : 'derived'}
                          </Badge>
                          {d.reasonClass ? (
                            <Badge variant="info" className="text-[9px] px-1.5 py-0 font-mono">
                              {d.reasonClass}
                            </Badge>
                          ) : null}
                        </div>
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {d.reasons.map((r, i) => (
                            <Badge key={i} variant="default" className="text-[10px]">
                              {r}
                            </Badge>
                          ))}
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
          )}
        </div>

        {selected && (
          <div className="hidden lg:block w-96 shrink-0 animate-slide-in">
            <Card className="sticky top-20 border-accent-cyan/30">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-text-primary font-semibold">
                    Decision Detail
                  </CardTitle>
                  <Button variant="ghost" size="sm" onClick={() => setSelected(null)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-2">
                  <DecisionActionBadge action={selected.action} />
                  <span className="text-lg font-semibold text-text-primary">{selected.token}</span>
                </div>

                <div className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-text-muted">Trace ID</span>
                    <code className="text-xs text-accent-cyan bg-bg-primary px-2 py-0.5 rounded">
                      {selected.id}
                    </code>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-muted">Timestamp</span>
                    <span className="text-text-secondary text-xs">
                      {formatTimestampFull(selected.timestamp)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-muted">Confidence</span>
                    <span
                      className={`font-medium ${
                        selected.confidence >= 0.7
                          ? 'text-accent-success'
                          : selected.confidence >= 0.4
                            ? 'text-accent-warning'
                            : 'text-accent-danger'
                      }`}
                    >
                      {selected.confidence.toFixed(3)}
                    </span>
                  </div>
                </div>

                <div>
                  <p className="text-xs font-medium text-text-muted mb-2 uppercase tracking-wider">
                    Reasons
                  </p>
                  <div className="space-y-1.5">
                    {selected.reasons.map((r, i) => (
                      <div
                        key={i}
                        className="flex items-start gap-2 text-sm text-text-secondary bg-bg-primary/50 rounded px-3 py-2"
                      >
                        <FileText className="h-3.5 w-3.5 shrink-0 mt-0.5 text-text-muted" />
                        {r}
                      </div>
                    ))}
                  </div>
                </div>

                {selected.provenanceKind === 'canonical' && selected.reasonClass && (
                  <div className="space-y-1 text-xs text-text-secondary">
                    <p className="text-text-muted uppercase tracking-wider text-[10px]">Provenance</p>
                    <div className="grid gap-1 font-mono text-[11px]">
                      {selected.executionMode ? (
                        <div>
                          <span className="text-text-muted">mode:</span> {selected.executionMode}
                        </div>
                      ) : null}
                      {selected.schemaVersion ? (
                        <div>
                          <span className="text-text-muted">schema:</span> {selected.schemaVersion}
                        </div>
                      ) : null}
                      {selected.sources && selected.sources.length > 0 ? (
                        <div className="break-all">
                          <span className="text-text-muted">sources:</span> {selected.sources.join(', ')}
                        </div>
                      ) : null}
                      {selected.freshness ? (
                        <div>
                          <span className="text-text-muted">freshness:</span> mkt {selected.freshness.marketAgeMs}ms ·
                          wallet {selected.freshness.walletAgeMs}ms (max {selected.freshness.maxAgeMs}ms)
                        </div>
                      ) : null}
                      {selected.evidenceRef && Object.keys(selected.evidenceRef).length > 0 ? (
                        <div className="break-all">
                          <span className="text-text-muted">evidence:</span>{' '}
                          {JSON.stringify(selected.evidenceRef)}
                        </div>
                      ) : null}
                    </div>
                  </div>
                )}

                {selected.provenanceKind === 'canonical' && selected.schemaVersion === 'decision.envelope.v3' && (
                  <div className="rounded-md border border-border-subtle/80 bg-bg-primary/40 p-3 space-y-2">
                    <p className="text-[10px] font-medium uppercase tracking-wider text-amber-600/90">
                      AI Advisory (Experimental)
                    </p>
                    <p className="text-[11px] text-text-muted leading-relaxed">
                      Non-authoritative interpretation only. Absent if the bot has advisory LLM disabled or no v3 snapshot.
                    </p>
                    {advisoryQuery.isLoading && (
                      <p className="text-xs text-text-muted">Loading advisory…</p>
                    )}
                    {advisoryQuery.isError && (
                      <p className="text-xs text-text-muted">Advisory unavailable.</p>
                    )}
                    {advisoryQuery.data && !advisoryQuery.data.enabled && (
                      <p className="text-xs text-text-muted">
                        Advisory LLM is off on the bot (<code className="text-[10px]">ADVISORY_LLM_ENABLED</code>).
                      </p>
                    )}
                    {advisoryQuery.data?.enabled && advisoryQuery.data.advisory && (
                      <div className="space-y-2 text-xs text-text-secondary">
                        <p>
                          <span className="text-text-muted">Advisory summary (non-authoritative):</span>{' '}
                          {advisoryQuery.data.advisory.summary}
                        </p>
                        <p>
                          <span className="text-text-muted">Advisory narrative (non-authoritative):</span>{' '}
                          {advisoryQuery.data.advisory.reasoning}
                        </p>
                        <div className="rounded border border-border-subtle/60 bg-bg-primary/30 px-2 py-1.5">
                          <p className="text-[10px] text-text-muted">
                            <span className="font-medium text-text-secondary">Advisory confidence</span>
                            {': '}
                            {advisoryQuery.data.advisory.confidence.toFixed(3)}
                          </p>
                          <p className="text-[10px] text-text-muted mt-0.5 leading-snug">
                            Self-rated LLM confidence only; not trade or decision confidence.
                          </p>
                        </div>
                        {advisoryQuery.data.audits?.[0] && (
                          <p className="text-[10px] text-text-muted font-mono">
                            {advisoryQuery.data.audits[0].provider} · {advisoryQuery.data.audits[0].latencyMs}ms ·{' '}
                            {advisoryQuery.data.audits[0].success ? 'ok' : advisoryQuery.data.audits[0].error ?? 'fail'}
                          </p>
                        )}
                      </div>
                    )}
                    {advisoryQuery.data?.enabled && !advisoryQuery.data.advisory && (
                      <p className="text-xs text-text-muted">No advisory text (timeout, error, or invalid schema).</p>
                    )}
                  </div>
                )}

                <div className="pt-2 border-t border-border-subtle space-y-1">
                  <p className="text-xs text-text-muted flex items-center gap-1.5">
                    <Clock className="h-3 w-3" />
                    Source:{' '}
                    {selected.provenanceKind === 'canonical'
                      ? 'runtime_cycle_summary (canonical envelope)'
                      : 'action_log_projection'}
                  </p>
                  {selected.actionLogAction && (
                    <p className="text-xs text-text-muted">
                      Action log: <span className="font-mono">{selected.actionLogAction}</span>
                      {selected.actionLogAgentId ? (
                        <>
                          {' '}
                          · agent <span className="font-mono">{selected.actionLogAgentId}</span>
                        </>
                      ) : null}
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
