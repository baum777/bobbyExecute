/**
 * Wave 5: Scenarios 1-6 basic detection.
 */
import { describe, expect, it } from "vitest";
import { runChaosSuite } from "../../src/chaos/chaos-suite.js";

describe("Scenarios 1-6 (Wave 5 P1)", () => {
  it("scenarios 1-6 pass with benign context", async () => {
    const report = await runChaosSuite("trace-benign");
    for (let id = 1; id <= 6; id++) {
      const r = report.results.find((x) => x.id === id);
      expect(r?.passed).toBe(true);
    }
  });

  it("scenario 1 fails when network partition detected", async () => {
    const report = await runChaosSuite("trace", { networkPartitionDetected: true });
    const s1 = report.results.find((r) => r.id === 1);
    expect(s1?.passed).toBe(false);
  });

  it("scenario 2 fails when node failure detected", async () => {
    const report = await runChaosSuite("trace", { nodeFailureDetected: true });
    const s2 = report.results.find((r) => r.id === 2);
    expect(s2?.passed).toBe(false);
  });

  it("scenario 3 fails when clock skew exceeds 5s", async () => {
    const report = await runChaosSuite("trace", { clockSkewMs: 6000 });
    const s3 = report.results.find((r) => r.id === 3);
    expect(s3?.passed).toBe(false);
  });

  it("scenario 4 fails when data corruption detected", async () => {
    const report = await runChaosSuite("trace", { dataCorruptionDetected: true });
    const s4 = report.results.find((r) => r.id === 4);
    expect(s4?.passed).toBe(false);
  });

  it("scenario 6 fails when source manipulation (price divergence)", async () => {
    const report = await runChaosSuite("trace", {
      sourceManipulationPrices: [100, 130],
    });
    const s6 = report.results.find((r) => r.id === 6);
    expect(s6?.passed).toBe(false);
  });
});
