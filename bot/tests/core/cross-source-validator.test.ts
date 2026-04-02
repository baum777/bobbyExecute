/**
 * M5: Cross-Source Validator tests.
 */
import { describe, expect, it } from "vitest";
import {
  validateCrossSource,
  hasDiscrepancy,
  classifyFreshnessBand,
  freshnessPenaltyForMs,
  freshnessScoreForMs,
} from "@bot/core/validate/cross-source-validator.js";

const now = new Date().toISOString();

const makeToken = (sources: string[]) => ({
  schema_version: "normalized_token.v1" as const,
  canonical_id: "test:solana:m1",
  symbol: "T",
  mint: "m1",
  chain: "solana" as const,
  sources,
  confidence_score: 0.8,
  mappings: {},
  metadata: {},
  discovered_at: now,
  last_updated: now,
});

describe("validateCrossSource", () => {
  it("reduces confidence for single source", () => {
    const tokens = [makeToken(["dexscreener"])];
    const results = validateCrossSource(tokens);
    expect(results[0].confidencePenalty).toBe(0.1);
    expect(results[0].validated.confidence_score).toBeLessThan(0.8);
  });

  it("returns validated tokens", () => {
    const tokens = [makeToken(["dexscreener", "paprika"])];
    const results = validateCrossSource(tokens);
    expect(results[0].validated).toBeDefined();
  });

  it("adds freshness penalty when freshnessMs > 30s", () => {
    const tokens = [makeToken(["dexscreener", "paprika"])];
    const results = validateCrossSource(tokens, { freshnessMs: 35_000 });
    expect(results[0].confidencePenalty).toBeCloseTo(freshnessPenaltyForMs(35_000), 5);
  });

  it("adds degraded penalty when 15s < freshnessMs <= 30s", () => {
    const tokens = [makeToken(["dexscreener", "paprika"])];
    const results = validateCrossSource(tokens, { freshnessMs: 20_000 });
    expect(results[0].confidencePenalty).toBeCloseTo(freshnessPenaltyForMs(20_000), 5);
  });

  it("shares freshness band semantics with the quality gate", () => {
    expect(classifyFreshnessBand(0)).toBe("fresh");
    expect(classifyFreshnessBand(20_000)).toBe("degraded");
    expect(classifyFreshnessBand(35_000)).toBe("stale");
    expect(freshnessScoreForMs(0)).toBe(1);
    expect(freshnessScoreForMs(35_000)).toBeLessThan(freshnessScoreForMs(20_000));
  });
});

describe("hasDiscrepancy", () => {
  it("flags large delta as discrepancy", () => {
    const { discrepancy, delta } = hasDiscrepancy(100, 50, 0.2);
    expect(delta).toBeGreaterThan(0.2);
    expect(discrepancy).toBe(true);
  });

  it("passes small delta", () => {
    const { discrepancy } = hasDiscrepancy(100, 95, 0.2);
    expect(discrepancy).toBe(false);
  });
});
