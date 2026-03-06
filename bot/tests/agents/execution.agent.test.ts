/**
 * Execution agent - quote, verifyBeforeTrade, executeSwap integration.
 */
import { describe, expect, it } from "vitest";
import { createExecutionHandler } from "@bot/agents/execution.agent.js";
import { createRpcClient } from "@bot/adapters/rpc-verify/client.js";
import type { TradeIntent } from "@bot/core/contracts/trade.js";

const baseIntent: TradeIntent = {
  traceId: "exec-test-trace",
  timestamp: "2026-03-05T12:00:00.000Z",
  idempotencyKey: "exec-key-1",
  tokenIn: "SOL",
  tokenOut: "USDC",
  amountIn: "1",
  minAmountOut: "0.95",
  slippagePercent: 1,
  dryRun: false,
};

describe("createExecutionHandler", () => {
  it("returns paper result when no deps (default)", async () => {
    const handler = await createExecutionHandler();
    const result = await handler(baseIntent);
    expect(result.success).toBe(true);
    expect(result.dryRun).toBe(true);
    expect(result.tradeIntentId).toBe("exec-key-1");
  });

  it("runs verifyBeforeTrade and executeSwap when deps with rpcClient and walletAddress", async () => {
    const rpcClient = createRpcClient();
    const handler = await createExecutionHandler({
      rpcClient,
      walletAddress: "11111111111111111111111111111111",
    });
    const result = await handler(baseIntent);
    expect(result.success).toBe(true);
    expect(result.dryRun).toBe(true);
  });

  it("fails when verifyBeforeTrade returns passed=false", async () => {
    const failingRpc = {
      getTokenInfo: async () => ({ mint: "x", decimals: 0, exists: false }),
      getBalance: async () => ({ address: "a", balance: "0", decimals: 9 }),
      getTransactionReceipt: async () => ({}),
    } as import("@bot/adapters/rpc-verify/client.js").RpcClient;
    const handler = await createExecutionHandler({
      rpcClient: failingRpc,
      walletAddress: "addr",
    });
    const result = await handler(baseIntent);
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});
