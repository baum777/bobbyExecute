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
      "./core/orchestrator.js": [
        "index.ts",
      ],
      "./core/tool-router.js": [
        "index.ts",
      ],
      "./memory/index.js": [
        "index.ts",
      ],
      "./core/universe/token-universe-builder.js": [
        "index.ts",
      ],
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

  it("keeps package root export surface from widening deprecated future-canonical paths", () => {
    const rootIndex = readSrc("index.ts");

    expect(rootIndex).not.toMatch(/export .*"\.\/signals\/signal-engine\.js"/);
    expect(rootIndex).not.toMatch(/export .*"\.\/scoring\/scoring-engine\.js"/);
    expect(rootIndex).not.toMatch(/export .*"\.\/intelligence\/signals\/build-constructed-signal-set\.js"/);
    expect(rootIndex).not.toMatch(/export .*"\.\/intelligence\/scoring\/build-score-card\.js"/);
    expect(rootIndex).not.toMatch(/export .*"\.\/tests\/migration\/parity-harness\.js"/);

    expect(rootIndex.match(/\.\/core\/orchestrator\.js/g)?.length ?? 0).toBe(1);
    expect(rootIndex.match(/\.\/core\/tool-router\.js/g)?.length ?? 0).toBe(1);
    expect(rootIndex.match(/\.\/memory\/index\.js/g)?.length ?? 0).toBe(1);
    expect(rootIndex.match(/\.\/core\/universe\/token-universe-builder\.js/g)?.length ?? 0).toBe(1);
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
