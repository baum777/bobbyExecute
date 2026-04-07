import { describe, expect, it } from 'vitest';
import { mockAdapters, mockDecisions, mockHealth, mockMetrics, mockSummary } from './mock-data';

describe('dashboard mock data provenance', () => {
  it('labels mock KPI surfaces as unwired rather than canonical or operational truth', () => {
    expect(mockHealth().surfaceKind).toBe('unwired');
    expect(mockAdapters().surfaceKind).toBe('unwired');
    expect(mockMetrics().surfaceKind).toBe('unwired');
    expect(mockSummary().metricProvenance).toMatchObject({
      riskScore: 'unwired',
      chaosPassRate: 'unwired',
      dataQuality: 'unwired',
      lastDecisionAt: 'unwired',
      tradesToday: 'unwired',
    });
  });

  it('renders mock decisions as legacy projections rather than canonical decision history', () => {
    const decisions = mockDecisions().decisions;
    expect(decisions.length).toBeGreaterThan(0);
    for (const decision of decisions) {
      expect(decision.provenanceKind).toBe('legacy_projection');
      expect(decision.source).toBe('action_log_projection');
    }
  });
});
