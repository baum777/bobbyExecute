import type { DecisionProvenanceKind, KpiMetricProvenance } from '@/types/api';

type TruthProvenance = KpiMetricProvenance | DecisionProvenanceKind;

const LABEL: Record<TruthProvenance, string> = {
  operational: 'operational',
  derived: 'derived',
  default: 'default',
  legacy_projection: 'legacy',
  unwired: 'unwired',
  canonical: 'canonical',
};

export function kpiProvenanceLabel(p: TruthProvenance | undefined): string {
  if (!p) return '—';
  return LABEL[p] ?? p;
}
