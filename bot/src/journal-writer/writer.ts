/**
 * Journal Writer - persistenz layer for journal entries.
 * Append-only, deterministic audit log.
 */
import { appendFile, readFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname } from "node:path";
import type { JournalEntry } from "../core/contracts/journal.js";

export interface JournalWriter {
  append(entry: JournalEntry): Promise<void>;
  getByTraceId(traceId: string): Promise<JournalEntry[]>;
  getRange(
    from: string,
    to: string,
    limit?: number
  ): Promise<JournalEntry[]>;
}

/**
 * In-memory journal writer for tests and development.
 */
export class InMemoryJournalWriter implements JournalWriter {
  private entries: JournalEntry[] = [];

  async append(entry: JournalEntry): Promise<void> {
    this.entries.push({ ...entry });
  }

  async getByTraceId(traceId: string): Promise<JournalEntry[]> {
    return this.entries.filter((e) => e.traceId === traceId);
  }

  async getRange(
    from: string,
    to: string,
    limit = 100
  ): Promise<JournalEntry[]> {
    const fromDate = new Date(from).getTime();
    const toDate = new Date(to).getTime();
    const filtered = this.entries.filter((e) => {
      const t = new Date(e.timestamp).getTime();
      return t >= fromDate && t <= toDate;
    });
    return filtered.slice(-limit);
  }

  list(): JournalEntry[] {
    return [...this.entries];
  }

  clear(): void {
    this.entries = [];
  }
}

/**
 * File-system journal writer.
 * Appends JSON-lines to a file for persistence.
 */
export class FileSystemJournalWriter implements JournalWriter {
  private readonly filePath: string;
  private readonly buffer: JournalEntry[] = [];
  private flushIntervalMs: number;
  private flushTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    filePath: string,
    options?: { flushIntervalMs?: number }
  ) {
    this.filePath = filePath;
    this.flushIntervalMs = options?.flushIntervalMs ?? 1000;
  }

  async append(entry: JournalEntry): Promise<void> {
    this.buffer.push(entry);
    await this.flush();
  }

  private async flush(): Promise<void> {
    if (this.buffer.length === 0) return;

    const dir = dirname(this.filePath);
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }

    const lines = this.buffer.splice(0, this.buffer.length).map((e) =>
      JSON.stringify(e)
    );
    await appendFile(this.filePath, lines.join("\n") + "\n", "utf8");
  }

  async getByTraceId(traceId: string): Promise<JournalEntry[]> {
    const all = await this.readAll();
    return all.filter((e) => e.traceId === traceId);
  }

  async getRange(
    from: string,
    to: string,
    limit = 100
  ): Promise<JournalEntry[]> {
    const fromDate = new Date(from).getTime();
    const toDate = new Date(to).getTime();
    const all = await this.readAll();
    const filtered = all.filter((e) => {
      const t = new Date(e.timestamp).getTime();
      return t >= fromDate && t <= toDate;
    });
    return filtered.slice(-limit);
  }

  private async readAll(): Promise<JournalEntry[]> {
    if (!existsSync(this.filePath)) return [];
    const content = await readFile(this.filePath, "utf8");
    return content
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as JournalEntry);
  }

  startPeriodicFlush(): void {
    if (this.flushTimer) return;
    this.flushTimer = setInterval(() => this.flush(), this.flushIntervalMs);
  }

  stopPeriodicFlush(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }
}
