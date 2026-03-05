/**
 * Hybrid Weights Tests - Target Architecture Validation
 * 
 * Validates that computeHybrid uses correct weights (0.55 MCI / 0.45 BCI)
 * per Target Architecture specification.
 */
import { describe, expect, it } from "vitest";
import { computeHybrid } from "@bot/core/intelligence/mci-bci-formulas.js";

describe("Hybrid Weights - Target Architecture", () => {
  it("uses correct weights 0.55/0.45 by default", () => {
    // computeHybrid(mci, bci) with default weights
    const hybrid = computeHybrid(1.0, 0);
    // Should be 0.55 * 1.0 + 0.45 * 0 = 0.55
    expect(hybrid).toBeCloseTo(0.55, 5);
  });

  it("uses correct weights for negative values", () => {
    const hybrid = computeHybrid(-1.0, 0);
    // Should be 0.55 * (-1.0) + 0.45 * 0 = -0.55
    expect(hybrid).toBeCloseTo(-0.55, 5);
  });

  it("uses correct weights for symmetric values", () => {
    const hybrid = computeHybrid(0.5, -0.5);
    // 0.55 * 0.5 + 0.45 * (-0.5) = 0.275 - 0.225 = 0.05
    expect(hybrid).toBeCloseTo(0.05, 5);
  });

  it("clamps to [-1, 1] when result exceeds range", () => {
    const hybrid = computeHybrid(2.0, 2.0);
    expect(hybrid).toBe(1.0);
  });

  it("clamps to [-1, 1] when result below range", () => {
    const hybrid = computeHybrid(-2.0, -2.0);
    expect(hybrid).toBe(-1.0);
  });

  it("allows custom weights for testing", () => {
    // Test with explicit 0.6/0.4 weights (old values)
    const hybrid = computeHybrid(1.0, 0, 0.6, 0.4);
    expect(hybrid).toBeCloseTo(0.6, 5);
  });

  it("allows custom weights for equal balance", () => {
    const hybrid = computeHybrid(0.8, 0.6, 0.5, 0.5);
    // 0.5 * 0.8 + 0.5 * 0.6 = 0.4 + 0.3 = 0.7
    expect(hybrid).toBeCloseTo(0.7, 5);
  });

  it("calculates neutral correctly", () => {
    const hybrid = computeHybrid(0, 0);
    expect(hybrid).toBe(0);
  });

  it("weights are exactly 0.55 and 0.45 (not rounded)", () => {
    // Verify precision by checking exact calculation
    const hybrid = computeHybrid(100, 0);
    // If weights are exactly 0.55/0.45, result should be 55 (then clamped to 1)
    expect(hybrid).toBe(1.0); // Gets clamped

    // Use small values to see actual weight calculation
    const smallHybrid = computeHybrid(0.01, 0);
    expect(smallHybrid).toBeCloseTo(0.0055, 10);
  });

  describe("Target Architecture Compliance", () => {
    it("MCI has higher weight than BCI", () => {
      // With equal inputs, MCI should contribute more
      const hybrid = computeHybrid(1.0, 1.0);
      expect(hybrid).toBe(1.0); // Both at max

      // With MCI positive and BCI negative
      const mixedHybrid = computeHybrid(1.0, -1.0);
      // 0.55 * 1.0 + 0.45 * (-1.0) = 0.55 - 0.45 = 0.10
      expect(mixedHybrid).toBeCloseTo(0.10, 5);
      // Result is positive, showing MCI weight > BCI weight
      expect(mixedHybrid).toBeGreaterThan(0);
    });

    it("sum of default weights equals 1.0", () => {
      // Verify weights are normalized
      const testCases = [
        { mci: 0.6, bci: 0.4 },
        { mci: 1.0, bci: 0.0 },
        { mci: 0.0, bci: 1.0 },
        { mci: 0.5, bci: 0.5 },
      ];

      for (const { mci, bci } of testCases) {
        const result = computeHybrid(mci, bci);
        // Expected: 0.55*mci + 0.45*bci
        const expected = 0.55 * mci + 0.45 * bci;
        expect(result).toBeCloseTo(expected, 5);
      }
    });
  });
});
