/**
 * TokenUniverse Contract Tests
 * Validates Zod schemas for NormalizedTokenV1 and TokenUniverseV1
 */
import { describe, expect, it } from "vitest";
import {
  TokenUniverseV1Schema,
  NormalizedTokenV1Schema,
  SourceMappingV1Schema,
  generateCanonicalId,
  calculateTokenConfidence,
} from "@bot/core/contracts/tokenuniverse.js";

describe("TokenUniverse Contracts", () => {
  describe("NormalizedTokenV1Schema", () => {
    it("validates a complete NormalizedTokenV1", () => {
      const now = new Date().toISOString();
      const token = NormalizedTokenV1Schema.parse({
        schema_version: "normalized_token.v1",
        canonical_id: "dexscreener:solana:ABC123",
        symbol: "TEST",
        mint: "ABC123",
        chain: "solana",
        sources: ["dexscreener"],
        confidence_score: 0.85,
        mappings: {
          dexscreener: { tokenId: "ABC123", pairId: "pair456" },
        },
        metadata: {
          name: "Test Token",
          decimals: 9,
          tags: ["raydium"],
        },
        discovered_at: now,
        last_updated: now,
      });
      expect(token.canonical_id).toBe("dexscreener:solana:ABC123");
      expect(token.confidence_score).toBe(0.85);
      expect(token.schema_version).toBe("normalized_token.v1");
    });

    it("validates with minimal fields", () => {
      const now = new Date().toISOString();
      const token = NormalizedTokenV1Schema.parse({
        schema_version: "normalized_token.v1",
        canonical_id: "paprika:solana:DEF456",
        symbol: "MIN",
        mint: "DEF456",
        chain: "solana",
        sources: ["paprika"],
        confidence_score: 0.5,
        mappings: {
          paprika: { tokenId: "DEF456" },
        },
        metadata: {},
        discovered_at: now,
        last_updated: now,
      });
      expect(token.metadata.tags).toEqual([]);
    });

    it("rejects invalid confidence_score > 1", () => {
      const now = new Date().toISOString();
      expect(() =>
        NormalizedTokenV1Schema.parse({
          schema_version: "normalized_token.v1",
          canonical_id: "test:solana:ABC",
          symbol: "BAD",
          mint: "ABC",
          chain: "solana",
          sources: ["paprika"],
          confidence_score: 1.5, // Invalid
          mappings: {},
          metadata: {},
          discovered_at: now,
          last_updated: now,
        })
      ).toThrow();
    });

    it("rejects invalid chain", () => {
      const now = new Date().toISOString();
      expect(() =>
        NormalizedTokenV1Schema.parse({
          schema_version: "normalized_token.v1",
          canonical_id: "test:invalid:ABC",
          symbol: "BAD",
          mint: "ABC",
          chain: "invalid_chain", // Not in enum
          sources: ["paprika"],
          confidence_score: 0.5,
          mappings: {},
          metadata: {},
          discovered_at: now,
          last_updated: now,
        })
      ).toThrow();
    });
  });

  describe("TokenUniverseV1Schema", () => {
    it("validates a complete TokenUniverseV1", () => {
      const now = new Date().toISOString();
      const universe = TokenUniverseV1Schema.parse({
        schema_version: "token_universe.v1",
        timestamp: now,
        mode: "reduced",
        tokens: [],
        stats: {
          total_count: 0,
          by_source: {},
          avg_confidence: 0,
        },
      });
      expect(universe.mode).toBe("reduced");
      expect(universe.schema_version).toBe("token_universe.v1");
    });

    it("validates with tokens", () => {
      const now = new Date().toISOString();
      const universe = TokenUniverseV1Schema.parse({
        schema_version: "token_universe.v1",
        timestamp: now,
        mode: "full",
        tokens: [
          {
            schema_version: "normalized_token.v1",
            canonical_id: "dexscreener:solana:TOKEN1",
            symbol: "TK1",
            mint: "TOKEN1",
            chain: "solana",
            sources: ["dexscreener"],
            confidence_score: 0.8,
            mappings: { dexscreener: { tokenId: "TOKEN1" } },
            metadata: { name: "Token One" },
            discovered_at: now,
            last_updated: now,
          },
        ],
        stats: {
          total_count: 1,
          by_source: { dexscreener: 1 },
          avg_confidence: 0.8,
        },
      });
      expect(universe.tokens).toHaveLength(1);
      expect(universe.stats.total_count).toBe(1);
    });

    it("rejects invalid mode", () => {
      const now = new Date().toISOString();
      expect(() =>
        TokenUniverseV1Schema.parse({
          schema_version: "token_universe.v1",
          timestamp: now,
          mode: "invalid_mode", // Not in enum
          tokens: [],
          stats: { total_count: 0, by_source: {}, avg_confidence: 0 },
        })
      ).toThrow();
    });
  });

  describe("SourceMappingV1Schema", () => {
    it("validates complete source mappings", () => {
      const mapping = SourceMappingV1Schema.parse({
        paprika: { tokenId: "abc", poolId: "pool1" },
        dexscreener: { tokenId: "def", pairId: "pair2" },
        moralis: { tokenAddress: "0x123" },
      });
      expect(mapping.paprika?.tokenId).toBe("abc");
      expect(mapping.paprika?.poolId).toBe("pool1");
      expect(mapping.dexscreener?.pairId).toBe("pair2");
      expect(mapping.moralis?.tokenAddress).toBe("0x123");
    });

    it("validates partial mappings", () => {
      const mapping = SourceMappingV1Schema.parse({
        dexscreener: { tokenId: "abc" }, // No pairId
      });
      expect(mapping.dexscreener?.tokenId).toBe("abc");
      expect(mapping.dexscreener?.pairId).toBeUndefined();
    });

    it("validates empty mappings", () => {
      const mapping = SourceMappingV1Schema.parse({});
      expect(mapping).toEqual({});
    });
  });

  describe("generateCanonicalId", () => {
    it("generates correct canonical ID", () => {
      const id = generateCanonicalId("solana", "ABC123");
      expect(id).toBe("solana:abc123");
    });

    it("normalizes to lowercase", () => {
      const id = generateCanonicalId("Solana", "AbCdEf");
      expect(id).toBe("solana:abcdef");
    });
  });

  describe("calculateTokenConfidence", () => {
    it("returns 0 for no sources", () => {
      const confidence = calculateTokenConfidence({}, {});
      expect(confidence).toBe(0);
    });

    it("calculates confidence with one source", () => {
      const confidence = calculateTokenConfidence(
        ["paprika"],
        { paprika: 0.8 }
      );
      // 40% * (1/3) + 60% * 0.8 = 0.133 + 0.48 = 0.613
      expect(confidence).toBeGreaterThan(0.5);
      expect(confidence).toBeLessThan(0.7);
    });

    it("calculates higher confidence with more sources", () => {
      const singleSource = calculateTokenConfidence(
        ["paprika"],
        { paprika: 0.8 }
      );
      const multiSource = calculateTokenConfidence(
        ["paprika", "dexscreener", "moralis"],
        { paprika: 0.8, dexscreener: 0.9, moralis: 0.7 }
      );
      expect(multiSource).toBeGreaterThan(singleSource);
    });

    it("caps source count contribution at 3 sources", () => {
      const threeSources = calculateTokenConfidence(
        ["a", "b", "c"],
        { a: 0.8, b: 0.8, c: 0.8 }
      );
      const fiveSources = calculateTokenConfidence(
        ["a", "b", "c", "d", "e"],
        { a: 0.8, b: 0.8, c: 0.8, d: 0.8, e: 0.8 }
      );
      expect(fiveSources).toBeCloseTo(threeSources, 5);
    });
  });
});
