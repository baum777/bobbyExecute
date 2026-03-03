/**
 * Determinism test - same input yields same decisionHash/resultHash.
 * PROPOSED for replay mode.
 */
import { describe, it, expect } from "vitest";
import { hashDecision, hashResult } from "@bot/core/determinism/hash.js";
import { canonicalize } from "@bot/core/determinism/canonicalize.js";

describe("Determinism", () => {
  it("canonicalize produces same output for equivalent objects", () => {
    const a = { b: 2, a: 1 };
    const b = { a: 1, b: 2 };
    expect(canonicalize(a)).toBe(canonicalize(b));
  });

  it("hashDecision produces same hash for same input", () => {
    const input = { market: { priceUsd: 100 }, wallet: { totalUsd: 500 } };
    const h1 = hashDecision(input);
    const h2 = hashDecision(input);
    expect(h1).toBe(h2);
  });

  it("hashResult produces same hash for same output", () => {
    const output = { success: true, txSignature: "abc123" };
    const h1 = hashResult(output);
    const h2 = hashResult(output);
    expect(h1).toBe(h2);
  });

  it("different inputs produce different hashes", () => {
    const input1 = { price: 100 };
    const input2 = { price: 101 };
    expect(hashDecision(input1)).not.toBe(hashDecision(input2));
  });
});
