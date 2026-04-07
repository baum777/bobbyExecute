import type { Decision } from '@/types/api';

export type CanonicalDecisionRow = Decision & { provenanceKind: 'canonical' };
export type LegacyProjectionDecisionRow = Decision & { provenanceKind: 'legacy_projection' };

export function isCanonicalDecisionRow(decision: Decision): decision is CanonicalDecisionRow {
  return decision.provenanceKind === 'canonical';
}

export function isLegacyProjectionDecisionRow(decision: Decision): decision is LegacyProjectionDecisionRow {
  return decision.provenanceKind === 'legacy_projection';
}

export function getCanonicalDecisionRows(decisions?: readonly Decision[]): CanonicalDecisionRow[] {
  return (decisions ?? []).filter(isCanonicalDecisionRow);
}

export function getLegacyProjectionDecisionRows(decisions?: readonly Decision[]): LegacyProjectionDecisionRow[] {
  return (decisions ?? []).filter(isLegacyProjectionDecisionRow);
}

export function getFirstCanonicalDecision(decisions?: readonly Decision[]): CanonicalDecisionRow | undefined {
  return getCanonicalDecisionRows(decisions)[0];
}
