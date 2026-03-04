import { describe, it, expect } from "vitest";
import { RunRequestSchema } from "../src/reducedmode/reducedmode.types.js";

describe("API smoke tests", () => {
  it("validates default run request", () => {
    const result = RunRequestSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.mode).toBe("dry");
    }
  });

  it("validates explicit run request", () => {
    const result = RunRequestSchema.safeParse({ mode: "live", maxTokens: 15 });
    expect(result.success).toBe(true);
  });

  it("rejects invalid mode", () => {
    const result = RunRequestSchema.safeParse({ mode: "invalid" });
    expect(result.success).toBe(false);
  });

  it("rejects maxTokens out of range", () => {
    const result = RunRequestSchema.safeParse({ maxTokens: 200 });
    expect(result.success).toBe(false);
  });
});
