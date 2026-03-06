/**
 * Wave 4: FileSystemActionLogger - persistence, load, list.
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { FileSystemActionLogger } from "../../src/observability/action-log.js";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("FileSystemActionLogger (Wave 4)", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "action-log-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("appends entries to JSONL file", async () => {
    const fp = join(tmpDir, "actions.jsonl");
    const logger = new FileSystemActionLogger(fp);

    await logger.append({
      agentId: "risk",
      userId: "u1",
      action: "evaluate",
      input: { token: "So11" },
      output: { allow: true },
      ts: new Date().toISOString(),
    });

    expect(logger.list().length).toBe(1);
    expect(logger.list()[0].action).toBe("evaluate");
  });

  it("loadFromFile restores entries after restart", async () => {
    const fp = join(tmpDir, "actions.jsonl");
    const logger = new FileSystemActionLogger(fp);
    await logger.append({
      agentId: "risk",
      userId: "u1",
      action: "evaluate",
      input: {},
      output: {},
      ts: "2026-01-01T00:00:00.000Z",
    });

    const logger2 = new FileSystemActionLogger(fp);
    const loaded = await logger2.loadFromFile();
    expect(loaded.length).toBe(1);
    expect(loaded[0].ts).toBe("2026-01-01T00:00:00.000Z");
  });

  it("ensureLoaded populates cache for list()", async () => {
    const fp = join(tmpDir, "actions.jsonl");
    const w = new FileSystemActionLogger(fp);
    await w.append({
      agentId: "x",
      userId: "y",
      action: "a",
      input: {},
      output: {},
      ts: new Date().toISOString(),
    });

    const r = new FileSystemActionLogger(fp);
    expect(r.list().length).toBe(0);
    await r.ensureLoaded();
    expect(r.list().length).toBe(1);
  });
});
