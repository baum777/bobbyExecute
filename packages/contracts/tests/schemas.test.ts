import { describe, it, expect } from "vitest";
import {
  TokenRefV1Schema,
  TokenSourceSnapshotV1Schema,
  DataQualityV1Schema,
  ReducedModeRunV1Schema,
  SourceEnum,
} from "../src/index.js";

describe("Contract Schemas", () => {
  it("validates TokenRefV1", () => {
    const result = TokenRefV1Schema.safeParse({
      symbol: "SOL",
      name: "Solana",
      contract_address: "So11111111111111111111111111111111",
      source: "dexscreener",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid source", () => {
    const result = TokenRefV1Schema.safeParse({
      symbol: "SOL",
      name: "Solana",
      contract_address: "ca",
      source: "invalid",
    });
    expect(result.success).toBe(false);
  });

  it("validates SourceEnum", () => {
    expect(SourceEnum.safeParse("dexscreener").success).toBe(true);
    expect(SourceEnum.safeParse("dexpaprika").success).toBe(true);
    expect(SourceEnum.safeParse("moralis").success).toBe(true);
    expect(SourceEnum.safeParse("rpc").success).toBe(true);
    expect(SourceEnum.safeParse("unknown").success).toBe(false);
  });

  it("validates TokenSourceSnapshotV1 with nulls", () => {
    const result = TokenSourceSnapshotV1Schema.safeParse({
      token_ref: {
        symbol: "TEST",
        name: "Test",
        contract_address: "ca123",
        source: "dexpaprika",
      },
      source: "dexpaprika",
      price_usd: null,
      volume_24h: null,
      liquidity_usd: null,
      fdv: null,
      market_cap_usd: null,
      price_change_24h_pct: null,
      fetched_at: "2026-01-01T00:00:00Z",
    });
    expect(result.success).toBe(true);
  });

  it("rejects DataQualityV1 with out-of-range completeness", () => {
    const result = DataQualityV1Schema.safeParse({
      completeness: 150,
      freshness: 50,
      cross_source_confidence: 0.5,
      discrepancy_rate: 0.1,
      sources_used: ["dexscreener"],
      discrepancies: [],
    });
    expect(result.success).toBe(false);
  });
});
