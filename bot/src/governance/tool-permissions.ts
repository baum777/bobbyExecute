/**
 * Tool-to-Permission mapping registry.
 * EXTRACTED from OrchestrAI_Labs packages/agent-runtime/src/execution/tool-permissions.ts
 * MAPPED for onchain trading tool layering.
 */
import type { Permission, ToolRef } from "../core/contracts/agent.js";

export const TOOL_PERMISSION_MAP: Record<ToolRef, Permission> = {
  "market.dexPaprika.getPool": "market.read",
  "market.dexPaprika.getTrending": "market.trending",
  "market.dexPaprika.getPairs": "market.read",

  "wallet.moralis.getBalances": "wallet.read",
  "wallet.moralis.getTransfers": "wallet.read",

  "chain.rpcVerify.token": "chain.verify",
  "chain.rpcVerify.balance": "chain.verify",
  "chain.rpcVerify.receipt": "chain.verify",

  "trade.dex.getQuote": "trade.quote",
  "trade.dex.executeSwap": "trade.execute",

  "journal.append": "journal.write",
  "alert.send": "alert.send",
};
