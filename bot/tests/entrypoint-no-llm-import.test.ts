/**
 * Guards: deterministic runtime entrypoints must not pull advisory LLM / scaffold surfaces.
 */
import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcRoot = join(__dirname, "..", "src");

async function readSrc(rel: string): Promise<string> {
  return readFile(join(srcRoot, rel), "utf8");
}

describe("runtime entrypoints do not import advisory LLM", () => {
  it("bootstrap.ts has no advisory-llm or legacy clients path", async () => {
    const text = await readSrc("bootstrap.ts");
    expect(text).not.toMatch(/advisory-llm|clients\/(llmClient|index)/);
  });

  it("worker/run.ts has no advisory-llm import", async () => {
    const text = await readSrc("worker/run.ts");
    expect(text).not.toMatch(/advisory-llm/);
  });

  it("server/run.ts has no advisory-llm import", async () => {
    const text = await readSrc("server/run.ts");
    expect(text).not.toMatch(/advisory-llm/);
  });

  it("core engine does not reference advisory-llm", async () => {
    const text = await readSrc("core/engine.ts");
    expect(text).not.toMatch(/advisory-llm/);
  });

  it("core engine does not reference v2 discovery scaffolding", async () => {
    const text = await readSrc("core/engine.ts");
    expect(text).not.toMatch(/discovery\/contracts|discovery\/source-observation|discovery\/discovery-evidence|discovery\/candidate-discovery|intelligence\/context|intelligence\/cqd|intelligence\/signals|intelligence\/universe\/build-universe-result/);
  });

  it("execution agent does not reference v2 discovery scaffolding", async () => {
    const text = await readSrc("agents/execution.agent.ts");
    expect(text).not.toMatch(/discovery\/contracts|discovery\/source-observation|discovery\/discovery-evidence|discovery\/candidate-discovery|intelligence\/context|intelligence\/cqd|intelligence\/signals|intelligence\/universe\/build-universe-result/);
  });
});

describe("package root export surface", () => {
  it("index.ts does not re-export advisory LLM", async () => {
    const text = await readSrc("index.ts");
    expect(text).not.toMatch(/advisory-llm|generateResponse|llmClient/);
  });

  it("index.ts does not re-export v2 discovery scaffolding", async () => {
    const text = await readSrc("index.ts");
    expect(text).not.toMatch(/\.\/discovery\/|\.\/intelligence\/.*contracts|\.\/decision\/contracts|\.\/learning\/contracts/);
  });
});
