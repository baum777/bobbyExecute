import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";

const SRC_ROOT = resolve(process.cwd(), "src");

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

function toRel(absPath: string): string {
  return absPath.slice(SRC_ROOT.length + 1).replaceAll("\\", "/");
}

function readSrc(relPath: string): string {
  return readFileSync(resolve(SRC_ROOT, relPath), "utf8");
}

function parseImports(text: string): string[] {
  const imports: string[] = [];
  const pattern = /from\s+["']([^"']+)["']/g;
  let match = pattern.exec(text);
  while (match) {
    imports.push(match[1]);
    match = pattern.exec(text);
  }
  return imports;
}

describe("runtime shadow authority boundary", () => {
  it("keeps risk/policy/decision/execution modules isolated from shadow artifact surfaces", () => {
    const authorityFiles = [
      "core/engine.ts",
      "core/decision/decision-coordinator.ts",
      "risk/risk-engine.ts",
      "governance/policy-engine.ts",
      "execution/execution-engine.ts",
    ];
    const forbiddenSpecifierPatterns = [
      /\/runtime\/shadow-artifact-chain\.js$/,
      /\/persistence\/runtime-cycle-summary-repository\.js$/,
    ];

    for (const relPath of authorityFiles) {
      const fileText = readSrc(relPath);
      expect(fileText).not.toContain("shadowArtifactChain");

      const imports = parseImports(fileText);
      for (const specifier of imports) {
        for (const forbidden of forbiddenSpecifierPatterns) {
          expect(
            specifier,
            `${relPath} must not import shadow artifact persistence/chain surfaces`
          ).not.toMatch(forbidden);
        }
      }
    }
  });

  it("keeps runtime shadow chain helper confined to runtime integration entrypoints", () => {
    const importers = walkTsFiles(SRC_ROOT)
      .filter((filePath) =>
        parseImports(readFileSync(filePath, "utf8")).some((specifier) =>
          specifier.endsWith("/shadow-artifact-chain.js") ||
          specifier === "./shadow-artifact-chain.js"
        )
      )
      .map(toRel)
      .sort();

    expect(importers).toEqual([
      "runtime/dry-run-runtime.ts",
      "runtime/live-runtime.ts",
    ]);

    const rootIndex = readSrc("index.ts");
    expect(rootIndex).not.toMatch(/export .*"\.\/runtime\/shadow-artifact-chain\.js"/);
  });

  it("keeps live and dry runtimes on the surviving authority helper instead of legacy signal/scoring modules", () => {
    const runtimeFiles = ["runtime/live-runtime.ts", "runtime/dry-run-runtime.ts"];
    const legacyAuthoritySpecifiers = [
      "../signals/signal-engine.js",
      "../scoring/scoring-engine.js",
      "../patterns/pattern-engine.js",
    ];

    for (const relPath of runtimeFiles) {
      const fileText = readSrc(relPath);
      const imports = parseImports(fileText);

      expect(imports).toContain("./authority-artifact-chain.js");
      expect(fileText).toContain("buildRuntimeAuthorityArtifactChain");

      for (const specifier of legacyAuthoritySpecifiers) {
        expect(
          imports,
          `${relPath} must not import legacy authority modules`
        ).not.toContain(specifier);
      }
    }
  });
});
