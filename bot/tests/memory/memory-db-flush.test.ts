/**
 * Wave 4: MemoryDB storagePath flush and loadJournalFromDisk.
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { MemoryDB } from "../../src/memory/memory-db.js";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("MemoryDB storagePath flush (Wave 4)", () => {
  let tmpDir: string;
  let storagePath: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "memdb-"));
    storagePath = join(tmpDir, "journal.jsonl");
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("compress flushes to disk when storagePath set", async () => {
    const db = new MemoryDB(storagePath);
    const snap = db.renew({ foo: "bar" }, { completeness: 0.9, freshness: 0.95 });
    await db.compress(snap);

    const { readFile } = await import("node:fs/promises");
    const content = await readFile(storagePath, "utf8");
    expect(content.trim().split("\n").length).toBe(1);
    const line = JSON.parse(content.trim());
    expect(line.traceId).toBe(snap.traceId);
    expect(Buffer.from(line.compressed, "base64").length).toBeGreaterThan(0);
  });

  it("loadJournalFromDisk restores journal", async () => {
    const db1 = new MemoryDB(storagePath);
    const snap = db1.renew({ x: 1 }, { completeness: 0.8, freshness: 0.9 });
    await db1.compress(snap);

    const db2 = new MemoryDB(storagePath);
    await db2.loadJournalFromDisk();
    const journal = db2.getJournal();
    expect(journal.length).toBe(1);
    expect(journal[0].traceId).toBe(snap.traceId);
  });
});
