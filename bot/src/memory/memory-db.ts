/**
 * Memory-DB - Iterative Renewed, Compressed, Hybrid.
 * Version: 1.0.0 | Owner: Kimi Swarm | Layer: memory | Last Updated: 2026-03-04
 * Wave 4: storagePath flush - persist journal to disk when path set.
 * @deprecated migration target: runtime cycle summaries + journal/evidence repositories.
 * Legacy non-surviving lineage; not canonical future path.
 */
import { compress as snappyCompress, uncompress as snappyUncompress } from "snappyjs";
import { appendFile, readFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname } from "node:path";
import { canonicalize } from "../core/determinism/canonicalize.js";
import { sha256 } from "../core/determinism/hash.js";
import { DATA_QUALITY_MIN_COMPLETENESS } from "../core/contracts/dataquality.js";
import { createMemoryTraceId, createTraceId } from "../observability/trace-id.js";

export interface MemorySnapshot {
  traceId: string;
  timestamp: string;
  data: unknown;
  dataQuality: { completeness: number; freshness: number };
  prevHash?: string;
}

export interface CompressedJournalEntry {
  traceId: string;
  timestamp: string;
  hash: string;
  compressed: Buffer;
  prevHash?: string;
}

const RENEWAL_INTERVAL_MS = 50_000;
const DATA_QUALITY_CHANGE_THRESHOLD = 0.04;

/**
 * @deprecated migration target: runtime cycle summary + journal/evidence repositories.
 * Transitional compatibility surface only; do not add new authority-path callers.
 */
export class MemoryDB {
  private snapshot: MemorySnapshot | null = null;
  private lastRenewalTimestamp = 0;
  private journal: CompressedJournalEntry[] = [];

  constructor(
    private readonly storagePath?: string
  ) {}

  /** Prüft ob Renewal nötig: 45-60s oder >4% DataQuality-Change */
  shouldRenew(dataQuality: { completeness: number; freshness: number }): boolean {
    const now = Date.now();
    const intervalOk = now - this.lastRenewalTimestamp >= RENEWAL_INTERVAL_MS;
    if (intervalOk) return true;

    if (!this.snapshot) return true;
    const completenessDelta = Math.abs(dataQuality.completeness - this.snapshot.dataQuality.completeness);
    const freshnessDelta = Math.abs(dataQuality.freshness - this.snapshot.dataQuality.freshness);
    return completenessDelta > DATA_QUALITY_CHANGE_THRESHOLD || freshnessDelta > DATA_QUALITY_CHANGE_THRESHOLD;
  }

  /** Fail-Closed bei <70% completeness. M1: Deterministic traceId, no Math.random. */
  renew(
    data: unknown,
    dataQuality: { completeness: number; freshness: number },
    parentTraceId?: string
  ): MemorySnapshot {
    if (dataQuality.completeness < DATA_QUALITY_MIN_COMPLETENESS) {
      throw new Error(`Fail-Closed: completeness ${dataQuality.completeness} < ${DATA_QUALITY_MIN_COMPLETENESS}`);
    }

    const timestamp = new Date().toISOString();
    const traceId = parentTraceId
      ? createMemoryTraceId(parentTraceId, dataQuality)
      : createTraceId({ timestamp, seed: dataQuality, prefix: "mem" });
    const prevHash = this.journal.length > 0 ? this.journal[this.journal.length - 1].hash : undefined;

    this.snapshot = {
      traceId,
      timestamp,
      data,
      dataQuality,
      prevHash,
    };

    this.lastRenewalTimestamp = Date.now();
    return this.snapshot;
  }

  /** Snappy + SHA-256 Hash-Chain */
  async compress(snapshot: MemorySnapshot): Promise<CompressedJournalEntry> {
    const canonical = canonicalize(snapshot);
    const hash = sha256(canonical);
    const compressed = Buffer.from(snappyCompress(Buffer.from(canonical, "utf8")));

    const entry: CompressedJournalEntry = {
      traceId: snapshot.traceId,
      timestamp: snapshot.timestamp,
      hash,
      compressed,
      prevHash: snapshot.prevHash,
    };

    this.journal.push(entry);

    if (this.storagePath) {
      await this.flushJournalToDisk(entry);
    }
    return entry;
  }

  /** Wave 4 P1: Flush compressed entry to storagePath (JSONL with base64 compressed). */
  private async flushJournalToDisk(entry: CompressedJournalEntry): Promise<void> {
    if (!this.storagePath) return;
    const dir = dirname(this.storagePath);
    if (!existsSync(dir)) await mkdir(dir, { recursive: true });
    const line = JSON.stringify({
      traceId: entry.traceId,
      timestamp: entry.timestamp,
      hash: entry.hash,
      compressed: entry.compressed.toString("base64"),
      prevHash: entry.prevHash,
    }) + "\n";
    await appendFile(this.storagePath, line, "utf8");
  }

  /** Wave 4 P1: Load journal from disk when storagePath set. Call after construction for recovery. */
  async loadJournalFromDisk(): Promise<void> {
    if (!this.storagePath || !existsSync(this.storagePath)) return;
    const content = await readFile(this.storagePath, "utf8");
    const lines = content.trim().split("\n").filter(Boolean);
    for (const line of lines) {
      const obj = JSON.parse(line) as { traceId: string; timestamp: string; hash: string; compressed: string; prevHash?: string };
      this.journal.push({
        traceId: obj.traceId,
        timestamp: obj.timestamp,
        hash: obj.hash,
        compressed: Buffer.from(obj.compressed, "base64"),
        prevHash: obj.prevHash,
      });
    }
  }

  getSnapshot(): MemorySnapshot | null {
    return this.snapshot;
  }

  getJournal(): CompressedJournalEntry[] {
    return [...this.journal];
  }

  /** Crash-Recovery: Dekomprimiert letzten Eintrag */
  async recoverLast(): Promise<MemorySnapshot | null> {
    if (this.journal.length === 0) return null;
    const last = this.journal[this.journal.length - 1];
    const decompressed = Buffer.from(snappyUncompress(last.compressed));
    const data = JSON.parse(decompressed.toString("utf8")) as MemorySnapshot;
    return data;
  }
}
