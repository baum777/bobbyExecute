/**
 * Wave 5: MEV/Sandwich detection - scenario 15 trigger.
 */
import { describe, expect, it } from "vitest";
import { detectMevSandwich } from "../../src/chaos/signals/mev-sandwich.js";
import { runChaosSuite } from "../../src/chaos/chaos-suite.js";

describe("MEV/Sandwich detection (Wave 5)", () => {
  it("no hit when no MEV indicators", () => {
    const r = detectMevSandwich({});
    expect(r.hit).toBe(false);
  });

  it("hit when front-run and back-run detected", () => {
    const r = detectMevSandwich({ frontRunDetected: true, backRunDetected: true });
    expect(r.hit).toBe(true);
    expect(r.reasonCode).toBe("MEV_SANDWICH");
    expect(r.severity).toBeGreaterThan(0);
  });

  it("hit when slippage exceeded with front-run", () => {
    const r = detectMevSandwich({ slippageExceeded: true, frontRunDetected: true });
    expect(r.hit).toBe(true);
    expect(r.reasonCode).toBe("MEV_SLIPPAGE_WITH_RUN");
  });

  it("hit when cluster sandwich (similar txs + slippage)", () => {
    const r = detectMevSandwich({
      similarTxInSameBlock: 3,
      slippageExceeded: true,
    });
    expect(r.hit).toBe(true);
    expect(r.reasonCode).toBe("MEV_CLUSTER_SANDWICH");
  });

  it("no hit with only front-run (no back-run or slippage)", () => {
    const r = detectMevSandwich({ frontRunDetected: true });
    expect(r.hit).toBe(false);
  });

  it("scenario 15 passes with benign context", async () => {
    const report = await runChaosSuite("trace-mev-ok");
    const s15 = report.results.find((r) => r.id === 15);
    expect(s15?.passed).toBe(true);
  });

  it("scenario 15 fails when MEV sandwich detected", async () => {
    const report = await runChaosSuite("trace-mev-bad", {
      mevFrontRun: true,
      mevBackRun: true,
    });
    const s15 = report.results.find((r) => r.id === 15);
    expect(s15?.passed).toBe(false);
  });
});
