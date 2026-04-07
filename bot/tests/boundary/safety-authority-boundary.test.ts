import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";

const SRC_ROOT = resolve(process.cwd(), "src");

function walkTsFiles(root: string): string[] {
  const files: string[] = [];

  for (const entry of readdirSync(root)) {
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

describe("safety authority boundary", () => {
  it("keeps advisory, case, and review-loop layers away from safety authority modules", () => {
    const watchedRoots = ["advisory", "advisory-llm", "casebook", "review-loops"];
    const forbiddenSpecifierPatterns = [
      /(?:^|\/)governance\/kill-switch\.js$/,
      /(?:^|\/)runtime\/live-control\.js$/,
      /(?:^|\/)runtime\/runtime-config-manager\.js$/,
      /(?:^|\/)control\/control-governance\.js$/,
      /(?:^|\/)server\/routes\/control\.js$/,
    ];

    const files = watchedRoots.flatMap((relRoot) => walkTsFiles(resolve(SRC_ROOT, relRoot)).map(toRel));
    expect(files.length).toBeGreaterThan(0);

    for (const relPath of files) {
      const fileText = readFileSync(resolve(SRC_ROOT, relPath), "utf8");
      const imports = parseImports(fileText);

      for (const specifier of imports) {
        for (const forbidden of forbiddenSpecifierPatterns) {
          expect(
            specifier,
            `${relPath} must not import safety authority surfaces`
          ).not.toMatch(forbidden);
        }
      }
    }
  });
});
