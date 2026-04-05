import type {
  MciBciScoreCard,
  MciBciSignal,
  MciBciSignalPack,
} from "../../src/core/intelligence/mci-bci-formulas.js";

export interface TestSignal extends MciBciSignal {
  source: string;
  baseToken: string;
  quoteToken: string;
  volume24h?: number;
  liquidity?: number;
  poolId?: string;
}

export interface TestSignalPack extends MciBciSignalPack {
  traceId: string;
  timestamp: string;
  sources: readonly string[];
  signals: readonly TestSignal[];
}

export type TestScoreCard = MciBciScoreCard;
