/**
 * Wave 7: Chaos integration - suite, gate, scenario wiring.
 */
import { describe, expect, it } from "vitest";
import {
  runChaosSuite,
  shouldAbort,
  ChaosGateError,
  ALL_SCENARIOS,
  type ChaosContext,
} from "../../src/chaos/index.js";
import { runChaosGate } from "../../src/governance/chaos-gate.js";

describe("Chaos integration (Wave 7)", () => {
  it("runChaosSuite returns report for all scenarios", async () => {
    const report = await runChaosSuite("chaos-int-trace");
    expect(report.total).toBe(ALL_SCENARIOS.length);
    expect(report.results).toHaveLength(ALL_SCENARIOS.length);
    expect(report.passRate).toBeGreaterThanOrEqual(0);
    expect(report.auditHashChain).toBeDefined();
  });

  it("runChaosGate passes with benign context", async () => {
    const { passed, report } = await runChaosGate("gate-ok");
    expect(passed).toBe(true);
    expect(report.passRate).toBeGreaterThanOrEqual(0.98);
  });

  it("runChaosGate throws ChaosGateError when category 5 fails", async () => {
    const ctx: ChaosContext = { mevFrontRun: true, mevBackRun: true };
    await expect(runChaosGate("gate-fail", ctx)).rejects.toThrow(ChaosGateError);
  });

  it("shouldAbort true when category 5 failed", async () => {
    const report = await runChaosSuite("abort-test", {
      mevFrontRun: true,
      mevBackRun: true,
    });
    expect(shouldAbort(report)).toBe(true);
  });

  it("scenario results propagate to report", async () => {
    const report = await runChaosSuite("prop-test", {
      networkPartitionDetected: true,
    });
    const s1 = report.results.find((r) => r.id === 1);
    expect(s1?.passed).toBe(false);
  });
});
