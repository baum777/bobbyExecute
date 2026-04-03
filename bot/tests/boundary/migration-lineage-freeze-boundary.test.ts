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

describe("migration lineage freeze boundaries", () => {
  it("marks deprecated-in-place legacy modules explicitly", () => {
    const deprecatedFiles = new Map<string, string>([
      ["core/orchestrator.ts", "@deprecated migration target"],
      ["core/tool-router.ts", "@deprecated migration target"],
      ["memory/index.ts", "@deprecated migration target"],
      ["memory/log-append.ts", "@deprecated migration target"],
      ["memory/memory-db.ts", "@deprecated migration target"],
      ["signals/signal-engine.ts", "@deprecated compatibility-only"],
      ["scoring/scoring-engine.ts", "@deprecated compatibility-only"],
      ["core/universe/token-universe-builder.ts", "@deprecated migration target"],
    ]);

    for (const [relPath, marker] of deprecatedFiles) {
      expect(readSrc(relPath), `${relPath} must carry explicit deprecation marker`).toContain(marker);
    }
  });

  it("freezes legacy scoring/signal caller sets (no new callers)", () => {
    expect(findImporters("../signals/signal-engine.js")).toEqual([]);
    expect(findImporters("../scoring/scoring-engine.js")).toEqual([]);
  });

  it("keeps authority modules free from orchestrator/tool-router/memory imports", () => {
    const authorityFiles = [
      "core/engine.ts",
      "runtime/controller.ts",
      "runtime/create-runtime.ts",
      "runtime/dry-run-runtime.ts",
      "runtime/live-runtime.ts",
      "runtime/paper-runtime.ts",
      "runtime/runtime-config-manager.ts",
    ];

    for (const relPath of authorityFiles) {
      const imports = parseImports(readSrc(relPath));
      for (const specifier of imports) {
        expect(
          specifier,
          `${relPath} must not regain deprecated authority coupling`
        ).not.toMatch(/\/core\/orchestrator\.js$|\/core\/tool-router\.js$|\/memory\/.+\.js$|\/memory\/index\.js$/);
      }
    }
  });

  it("keeps deprecated root exports explicitly marked and non-canonical", () => {
    const rootIndex = readSrc("index.ts");

    expect(rootIndex).toContain("legacy non-surviving lineage");
    expect(rootIndex).toContain("@deprecated migration target: `core/engine.ts` + `runtime/*`");
    expect(rootIndex).toContain("@deprecated migration target: `intelligence/universe/build-universe-result.ts`");
    expect(rootIndex).toContain("runtime cycle summaries + journal/evidence repositories");
    expect(rootIndex).not.toMatch(/export .*"\.\/signals\/signal-engine\.js"/);
    expect(rootIndex).not.toMatch(/export .*"\.\/scoring\/scoring-engine\.js"/);
  });
});
