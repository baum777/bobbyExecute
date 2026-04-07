import { describe, expect, it } from "vitest";
import {
  mockAdapters,
  mockDecisions,
  mockHealth,
  mockMetrics,
  mockSummary,
} from "./mock-data.js";
import { kpiProvenanceLabel } from "./kpi-provenance.js";

describe("dashboard authority boundary", () => {
  it("labels KPI surfaces honestly and never upgrades projections to canonical truth", () => {
    const health = mockHealth();
    const summary = mockSummary();
    const adapters = mockAdapters();
    const metrics = mockMetrics();
    const decisions = mockDecisions();

    expect(health.surfaceKind).toBe("unwired");
    expect(summary.metricProvenance?.riskScore).toBe("unwired");
    expect(summary.metricProvenance?.chaosPassRate).toBe("unwired");
    expect(summary.metricProvenance?.dataQuality).toBe("unwired");
    expect(summary.metricProvenance?.lastDecisionAt).toBe("unwired");
    expect(summary.metricProvenance?.tradesToday).toBe("unwired");
    expect(adapters.surfaceKind).toBe("unwired");
    expect(metrics.surfaceKind).toBe("unwired");
    expect(decisions.decisions.every((decision) => decision.provenanceKind === "legacy_projection")).toBe(true);
    expect(decisions.decisions.every((decision) => decision.source === "action_log_projection")).toBe(true);
    expect(decisions.decisions.every((decision) => !("decisionEnvelope" in decision))).toBe(true);

    expect(kpiProvenanceLabel("canonical")).toBe("canonical");
    expect(kpiProvenanceLabel("operational")).toBe("operational");
    expect(kpiProvenanceLabel("derived")).toBe("derived");
    expect(kpiProvenanceLabel("default")).toBe("default");
    expect(kpiProvenanceLabel("legacy_projection")).toBe("legacy");
    expect(kpiProvenanceLabel("unwired")).toBe("unwired");
    expect(kpiProvenanceLabel(undefined)).toBe("—");
  });
});

