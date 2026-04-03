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
  let match: RegExpExecArray | null = pattern.exec(text);
  while (match) {
    imports.push(match[1]);
    match = pattern.exec(text);
  }
  return imports;
}

function findImporters(specifier: string): string[] {
  return walkTsFiles(SRC_ROOT)
    .filter((filePath) => parseImports(readFileSync(filePath, "utf8")).includes(specifier))
    .map(toRel)
    .sort();
}

describe("migration parity boundary guards", () => {
  it("freezes no-new-caller baselines for deprecated lineages", () => {
    const expectedImporters: Record<string, string[]> = {
      "../signals/signal-engine.js": [],
      "../scoring/scoring-engine.js": [],
      "./core/orchestrator.js": [],
      "./core/tool-router.js": [],
      "./memory/index.js": [],
      "../memory/memory-db.js": [
        "core/orchestrator.ts",
      ],
      "../memory/log-append.js": [
        "core/orchestrator.ts",
      ],
      "./memory-db.js": [
        "memory/index.ts",
      ],
      "./log-append.js": [
        "memory/index.ts",
      ],
      "./core/universe/token-universe-builder.js": [],
    };

    for (const [specifier, importers] of Object.entries(expectedImporters)) {
      expect(findImporters(specifier), `caller drift: ${specifier}`).toEqual(importers);
    }
  });

  it("keeps active authority modules isolated from deprecated and MCP/prompt surfaces", () => {
    const authorityFiles = [
      "core/engine.ts",
      "runtime/controller.ts",
      "runtime/create-runtime.ts",
      "runtime/dry-run-runtime.ts",
      "runtime/live-runtime.ts",
      "runtime/paper-runtime.ts",
      "runtime/runtime-config-manager.ts",
    ];

    const forbiddenSpecifierPatterns = [
      /\/core\/orchestrator\.js$/,
      /\/core\/tool-router\.js$/,
      /\/memory\/index\.js$/,
      /\/memory\/.+\.js$/,
      /\/mcp\//,
      /advisory-llm\/prompt-builder\.js$/,
      /advisory-llm\/providers\//,
      /\/prompt-resources?\//,
      /\/resource-registry\./,
    ];

    for (const relPath of authorityFiles) {
      const imports = parseImports(readSrc(relPath));
      for (const specifier of imports) {
        for (const forbidden of forbiddenSpecifierPatterns) {
          expect(
            specifier,
            `${relPath} must remain authority-isolated from forbidden surfaces`
          ).not.toMatch(forbidden);
        }
      }
    }
  });

  it("blocks new production callers into legacy orchestrator/tool-router/memory surfaces", () => {
    const allowedLegacyImporters = new Set(["core/orchestrator.ts", "memory/index.ts"]);
    const forbiddenSpecifierPatterns = [
      /\/core\/orchestrator\.js$/,
      /\/core\/tool-router\.js$/,
      /\/memory\/index\.js$/,
      /\/memory-db\.js$/,
      /\/log-append\.js$/,
    ];

    for (const filePath of walkTsFiles(SRC_ROOT)) {
      const relPath = toRel(filePath);
      if (allowedLegacyImporters.has(relPath)) {
        continue;
      }

      const imports = parseImports(readFileSync(filePath, "utf8"));
      for (const specifier of imports) {
        for (const forbidden of forbiddenSpecifierPatterns) {
          expect(
            specifier,
            `${relPath} must not import legacy orchestrator/tool-router/memory surfaces`
          ).not.toMatch(forbidden);
        }
      }
    }
  });

  it("keeps package root export surface from widening deprecated future-canonical paths", () => {
    const rootIndex = readSrc("index.ts");

    expect(rootIndex).not.toMatch(/export .*"\.\/core\/tool-router\.js"/);
    expect(rootIndex).not.toMatch(/export .*"\.\/core\/orchestrator\.js"/);
    expect(rootIndex).not.toMatch(/export .*"\.\/core\/contracts\/index\.js"/);
    expect(rootIndex).not.toMatch(/export .*"\.\/core\/intelligence\/mci-bci-formulas\.js"/);
    expect(rootIndex).not.toMatch(/export .*"\.\/core\/universe\/token-universe-builder\.js"/);
    expect(rootIndex).not.toMatch(/export .*"\.\/memory\/index\.js"/);
    expect(rootIndex).not.toMatch(/export .*"\.\/core\/contracts\/scorecard\.js"/);
    expect(rootIndex).not.toMatch(/export .*"\.\/core\/contracts\/signalpack\.js"/);
    expect(rootIndex).not.toMatch(/export .*"\.\/core\/contracts\/tokenuniverse\.js"/);
  });

  it("prevents runtime source from importing migration parity harness fixtures", () => {
    const srcFiles = walkTsFiles(SRC_ROOT);

    for (const filePath of srcFiles) {
      const relPath = toRel(filePath);
      const imports = parseImports(readFileSync(filePath, "utf8"));
      for (const specifier of imports) {
        expect(
          specifier,
          `${relPath} must not import test-only migration harness surfaces`
        ).not.toMatch(/tests\/migration|fixtures\/migration|parity-harness/);
      }
    }
  });
});
