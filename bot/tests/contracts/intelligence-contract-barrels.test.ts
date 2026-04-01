import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const BARREL_FILES = [
  "src/intelligence/context/contracts/index.ts",
  "src/intelligence/cqd/contracts/index.ts",
  "src/intelligence/quality/contracts/index.ts",
  "src/intelligence/universe/contracts/index.ts",
];

describe("intelligence contract barrels", () => {
  it("contain one export surface each without duplicate lines", () => {
    for (const relativePath of BARREL_FILES) {
      const contents = readFileSync(resolve(process.cwd(), relativePath), "utf8")
        .trim()
        .split("\n");

      expect(contents).toHaveLength(1);
      expect(new Set(contents).size).toBe(contents.length);
      expect(contents[0]).toMatch(/^export \* from "\.\/.+\.js";$/);
    }
  });
});
