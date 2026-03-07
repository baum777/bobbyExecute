/**
 * Schema validation tests - Normalized planning package P7.
 * Validates JSON schemas against contract fixtures.
 */
import { describe, expect, it } from "vitest";
import { TradeIntentSchema } from "../../src/core/contracts/trade.js";
import { JournalEntrySchema } from "../../src/core/contracts/journal.js";
import { RiskDecisionSchema } from "../../src/core/contracts/trade.js";

describe("Schema validation (P7)", () => {
  it("trade-intent schema validates valid payload", () => {
    const valid = {
      traceId: "trace-1",
      timestamp: "2026-03-07T12:00:00.000Z",
      idempotencyKey: "key-1",
      tokenIn: "SOL",
      tokenOut: "USDC",
      amountIn: "1",
      minAmountOut: "0.95",
      slippagePercent: 1,
      dryRun: true,
      executionMode: "dry",
    };
    const result = TradeIntentSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it("trade-intent schema rejects invalid executionMode", () => {
    const invalid = {
      traceId: "trace-1",
      timestamp: "2026-03-07T12:00:00.000Z",
      idempotencyKey: "key-1",
      tokenIn: "SOL",
      tokenOut: "USDC",
      amountIn: "1",
      minAmountOut: "0.95",
      slippagePercent: 1,
      dryRun: true,
      executionMode: "invalid",
    };
    const result = TradeIntentSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it("journal-entry schema validates valid payload", () => {
    const valid = {
      traceId: "trace-1",
      timestamp: "2026-03-07T12:00:00.000Z",
      stage: "complete",
      input: {},
      output: {},
      eventHash: "abc123",
    };
    const result = JournalEntrySchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it("risk-decision schema validates valid payload", () => {
    const valid = {
      allowed: false,
      checks: { liquidity: true, slippage: false },
      reason: "Low liquidity",
      severity: "high",
    };
    const result = RiskDecisionSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });
});
