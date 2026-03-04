import { describe, expect, it } from "vitest";
import { runChaosSuite } from "@bot/chaos/chaos-suite.js";

describe("Chaos Gate Pre-Merge", () => {
  it("validates all 19 chaos scenarios including category 5", async () => {
    const report = await runChaosSuite("premerge-chaos-gate");

    expect(report.total).toBe(19);
    expect(report.results).toHaveLength(19);
    expect(report.passRate).toBeGreaterThanOrEqual(0.98);
    expect(report.auditHashChain.length).toBeGreaterThan(0);

    const category5 = report.results.filter((r) => r.category === 5);
    expect(category5).toHaveLength(8);
    expect(category5.every((r) => r.passed)).toBe(true);
  });
});
