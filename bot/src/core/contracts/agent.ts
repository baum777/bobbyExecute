/**
 * Agent profile and permission types.
 * MAPPED from OrchestrAI_Labs packages/shared/src/types/agent.ts
 */

export type AgentRole =
  | "executor"
  | "monitor"
  | "strategy"
  | "research"
  | "risk"
  | "auditor";

export type Permission =
  | "market.read"
  | "market.trending"
  | "wallet.read"
  | "chain.verify"
  | "trade.quote"
  | "trade.execute"
  | "trade.withdraw"
  | "journal.write"
  | "alert.send"
  | "review.request"
  | "review.approve";

export type ToolRef =
  | "market.dexPaprika.getPool"
  | "market.dexPaprika.getTrending"
  | "market.dexPaprika.getPairs"
  | "wallet.moralis.getBalances"
  | "wallet.moralis.getTransfers"
  | "chain.rpcVerify.token"
  | "chain.rpcVerify.balance"
  | "chain.rpcVerify.receipt"
  | "trade.dex.getQuote"
  | "trade.dex.executeSwap"
  | "journal.append"
  | "alert.send";

export type ReviewPolicy = {
  mode: "none" | "draft_only" | "required";
  requiresHumanFor: Permission[];
  reviewerRoles: ("senior" | "admin")[];
  notes?: string;
};

export type AgentProfile = {
  id: string;
  name: string;
  role: AgentRole;
  permissions: Permission[];
  tools: ToolRef[];
  reviewPolicy: ReviewPolicy;
};
