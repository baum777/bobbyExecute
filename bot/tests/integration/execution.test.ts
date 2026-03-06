/**
 * Wave 7: Execution integration - quote, verify, swap flow.
 */
import { describe, expect, it } from "vitest";
import { createExecutionHandler } from "../../src/agents/execution.agent.js";
import { createRpcClient } from "../../src/adapters/rpc-verify/client.js";
import type { TradeIntent } from "../../src/core/contracts/trade.js";

const baseIntent: TradeIntent = {
  traceId: "exec-int-trace",
  timestamp: "2026-03-06T12:00:00.000Z",
  idempotencyKey: "exec-int-key",
  tokenIn: "SOL",
  tokenOut: "USDC",
  amountIn: "1",
  minAmountOut: "0.95",
  slippagePercent: 1,
  dryRun: false,
};

describe("Execution integration (Wave 7)", () => {
  it("handler with RPC client runs verify + swap path", async () => {
    const rpcClient = createRpcClient();
    const handler = await createExecutionHandler({
      rpcClient,
      walletAddress: "11111111111111111111111111111111",
    });
    const result = await handler(baseIntent);
    expect(result.success).toBe(true);
    expect(result.tradeIntentId).toBe(baseIntent.idempotencyKey);
  });

  it("verify failure blocks execution and returns success=false", async () => {
    const failingRpc = {
      getTokenInfo: async () => ({ mint: "x", decimals: 0, exists: false }),
      getBalance: async () => ({ address: "a", balance: "0", decimals: 9 }),
      getTransactionReceipt: async () => ({}),
    } as import("../../src/adapters/rpc-verify/client.js").RpcClient;

    const handler = await createExecutionHandler({
      rpcClient: failingRpc,
      walletAddress: "addr",
    });
    const result = await handler(baseIntent);
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it("paper mode returns dryRun=true without SwapDeps", async () => {
    const handler = await createExecutionHandler();
    const result = await handler({ ...baseIntent, dryRun: true });
    expect(result.success).toBe(true);
    expect(result.dryRun).toBe(true);
  });
});
