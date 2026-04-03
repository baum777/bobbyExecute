import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";

const SRC_ROOT = resolve(process.cwd(), "src");
const TEST_ROOT = resolve(process.cwd(), "tests");

const LEGACY_SPECIFIERS = [
  "../signals/signal-engine.js",
  "../scoring/scoring-engine.js",
  "../../src/signals/signal-engine.js",
  "../../src/scoring/scoring-engine.js",
  "@bot/signals/signal-engine.js",
  "@bot/scoring/scoring-engine.js",
] as const;

const ALLOWED_TEST_IMPORTERS: Record<string, string[]> = {
  "../../src/signals/signal-engine.js": [
    "integration/decision-path-convergence.test.ts",
    "unit/runtime-truthfulness.test.ts",
  ],
  "../../src/scoring/scoring-engine.js": [
    "integration/decision-path-convergence.test.ts",
    "unit/runtime-truthfulness.test.ts",
  ],
  "@bot/signals/signal-engine.js": ["migration/parity-harness.ts"],
  "@bot/scoring/scoring-engine.js": ["migration/parity-harness.ts"],
};

function walkTsFiles(root: string): string[] {
  const entries = readdirSync(root);
  const files: string[] = [];

  for (const entry of entries) {
    const full = resolve(root, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      files.push(...walkTsFiles(full));
      continue;
    }
    if (full.endsWith(".ts")) {
      files.push(full);
    }
  }

  return files;
}

function toRel(root: string, absPath: string): string {
  return absPath.slice(root.length + 1).replaceAll("\\", "/");
}

function parseImports(text: string): string[] {
  const imports: string[] = [];
  const pattern = /from\s+["']([^"']+)["']/g;
  let match: RegExpExecArray | null = pattern.exec(text);
  while (match) {
    imports.push(match[1]);
    match = pattern.exec(text);
  }
  return imports;
}

function findImporters(root: string, specifier: string): string[] {
  return walkTsFiles(root)
    .filter((filePath) => parseImports(readFileSync(filePath, "utf8")).includes(specifier))
    .map((filePath) => toRel(root, filePath))
    .sort();
}

describe("legacy signal/scoring compatibility freeze", () => {
  it("blocks new production callers and preserves only the explicit test allowlist", () => {
    for (const specifier of LEGACY_SPECIFIERS) {
      expect(findImporters(SRC_ROOT, specifier), `${specifier} must not be imported by production src`).toEqual([]);
    }

    for (const [specifier, allowedImporters] of Object.entries(ALLOWED_TEST_IMPORTERS)) {
      expect(findImporters(TEST_ROOT, specifier), `${specifier} test allowlist drift`).toEqual(allowedImporters);
    }
  });
});
