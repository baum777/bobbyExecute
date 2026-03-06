/**
 * M0: Safety Switch - executeSwap must block live path by default.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { executeSwap } from "@bot/adapters/dex-execution/swap.js";
import type { TradeIntent } from "@bot/core/contracts/trade.js";

const baseIntent: TradeIntent = {
  traceId: "trace-1",
  timestamp: "2026-03-05T12:00:00.000Z",
  idempotencyKey: "key-1",
  tokenIn: "SOL",
  tokenOut: "USDC",
  amountIn: "1",
  minAmountOut: "0.95",
  slippagePercent: 1,
  dryRun: false,
};

describe("Swap Safety (M0)", () => {
  const origEnv = process.env.LIVE_TRADING;

  beforeEach(() => {
    delete process.env.LIVE_TRADING;
  });

  afterEach(() => {
    if (origEnv !== undefined) process.env.LIVE_TRADING = origEnv;
    else delete process.env.LIVE_TRADING;
  });

  it("returns paper result when LIVE_TRADING unset and dryRun=false", async () => {
    const result = await executeSwap(baseIntent);
    expect(result.dryRun).toBe(true);
    expect(result.success).toBe(true);
    expect(result.tradeIntentId).toBe("key-1");
  });

  it("returns paper result when LIVE_TRADING=false and dryRun=false", async () => {
    process.env.LIVE_TRADING = "false";
    const result = await executeSwap(baseIntent);
    expect(result.dryRun).toBe(true);
    expect(result.success).toBe(true);
  });

  it("returns paper result when LIVE_TRADING empty and dryRun=false", async () => {
    process.env.LIVE_TRADING = "";
    const result = await executeSwap(baseIntent);
    expect(result.dryRun).toBe(true);
  });

  it("returns paper result when intent.dryRun=true regardless of LIVE_TRADING", async () => {
    process.env.LIVE_TRADING = "true";
    const result = await executeSwap({ ...baseIntent, dryRun: true });
    expect(result.dryRun).toBe(true);
    expect(result.success).toBe(true);
  });

  it("throws when LIVE_TRADING=true and dryRun=false (real path requires deps or RPC_MODE=stub)", async () => {
    process.env.LIVE_TRADING = "true";
    await expect(executeSwap(baseIntent)).rejects.toThrow(
      /not implemented|paper-trade|RPC_MODE=real|requires|SwapDeps/
    );
  });

  it("interprets LIVE_TRADING=true case-insensitively", async () => {
    process.env.LIVE_TRADING = "True";
    await expect(executeSwap(baseIntent)).rejects.toThrow();
  });
});
