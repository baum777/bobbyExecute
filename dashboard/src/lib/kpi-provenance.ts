import type { KpiMetricProvenance } from '@/types/api';

const LABEL: Record<KpiMetricProvenance, string> = {
  wired: 'wired',
  derived: 'derived',
  default: 'default',
  legacy_projection: 'legacy',
  unwired: 'unwired',
};

export function kpiProvenanceLabel(p: KpiMetricProvenance | undefined): string {
  if (!p) return '—';
  return LABEL[p] ?? p;
}
