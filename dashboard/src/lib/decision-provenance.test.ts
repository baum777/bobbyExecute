import { describe, expect, it } from 'vitest';
import {
  getCanonicalDecisionRows,
  getFirstCanonicalDecision,
  getLegacyProjectionDecisionRows,
} from './decision-provenance';
import type { Decision } from '@/types/api';

const decisionRows = [
  {
    id: 'legacy-1',
    timestamp: '2026-04-07T08:59:00.000Z',
    action: 'block',
    token: 'LEGACY-1',
    confidence: 0.2,
    reasons: ['projection'],
    provenanceKind: 'legacy_projection',
    source: 'action_log_projection',
  },
  {
    id: 'canon-1',
    timestamp: '2026-04-07T09:00:00.000Z',
    action: 'allow',
    token: 'CANON-1',
    confidence: 0.91,
    reasons: ['canonical'],
    provenanceKind: 'canonical',
    source: 'runtime_cycle_summary',
  },
  {
    id: 'legacy-2',
    timestamp: '2026-04-07T09:01:00.000Z',
    action: 'abort',
    token: 'LEGACY-2',
    confidence: 0.11,
    reasons: ['projection'],
    provenanceKind: 'legacy_projection',
    source: 'action_log_projection',
  },
] satisfies Decision[];

describe('decision provenance selectors', () => {
  it('returns only canonical rows', () => {
    const canonicalRows = getCanonicalDecisionRows(decisionRows);

    expect(canonicalRows).toHaveLength(1);
    expect(canonicalRows.every((decision) => decision.provenanceKind === 'canonical')).toBe(true);
    expect(canonicalRows[0]?.id).toBe('canon-1');
  });

  it('returns only legacy projection rows', () => {
    const legacyRows = getLegacyProjectionDecisionRows(decisionRows);

    expect(legacyRows).toHaveLength(2);
    expect(legacyRows.every((decision) => decision.provenanceKind === 'legacy_projection')).toBe(true);
    expect(legacyRows.map((decision) => decision.id)).toEqual(['legacy-1', 'legacy-2']);
  });

  it('returns the first canonical row even when legacy rows appear first', () => {
    const firstCanonical = getFirstCanonicalDecision(decisionRows);

    expect(firstCanonical?.id).toBe('canon-1');
    expect(firstCanonical?.provenanceKind).toBe('canonical');
  });
});
