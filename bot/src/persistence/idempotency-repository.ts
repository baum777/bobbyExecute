import { readJsonFile, writeJsonFile } from "./json-file.js";

export interface IdempotencyRecord {
  key: string;
  value: unknown;
  createdAt: string;
  expiresAt?: number;
}

export interface IdempotencyRepository {
  kind: "file" | "memory";
  load(): Promise<IdempotencyRecord[] | null>;
  save(records: IdempotencyRecord[]): Promise<void>;
  loadSync(): IdempotencyRecord[] | null;
  saveSync(records: IdempotencyRecord[]): void;
  has(key: string): Promise<boolean>;
  put(key: string, value: unknown, ttlMs?: number): Promise<void>;
  hasSync(key: string): boolean;
  putSync(key: string, value: unknown, ttlMs?: number): void;
}

function normalizeRecords(records: IdempotencyRecord[]): IdempotencyRecord[] {
  const now = Date.now();
  return records.filter((record) => record.expiresAt == null || record.expiresAt > now);
}

export class FileSystemIdempotencyRepository implements IdempotencyRepository {
  kind = "file" as const;

  constructor(private readonly filePath: string) {}

  async load(): Promise<IdempotencyRecord[] | null> {
    return this.loadSync();
  }

  save(records: IdempotencyRecord[]): Promise<void> {
    this.saveSync(records);
    return Promise.resolve();
  }

  loadSync(): IdempotencyRecord[] | null {
    const records = readJsonFile<IdempotencyRecord[]>(this.filePath);
    if (!records) {
      return null;
    }
    return normalizeRecords(records);
  }

  saveSync(records: IdempotencyRecord[]): void {
    writeJsonFile(this.filePath, normalizeRecords(records));
  }

  async has(key: string): Promise<boolean> {
    return this.hasSync(key);
  }

  async put(key: string, value: unknown, ttlMs?: number): Promise<void> {
    this.putSync(key, value, ttlMs);
  }

  hasSync(key: string): boolean {
    const records = this.loadSync() ?? [];
    return records.some((record) => record.key === key);
  }

  putSync(key: string, value: unknown, ttlMs?: number): void {
    const records = this.loadSync() ?? [];
    const filtered = records.filter((record) => record.key !== key);
    filtered.push({
      key,
      value,
      createdAt: new Date().toISOString(),
      expiresAt: ttlMs != null ? Date.now() + ttlMs : undefined,
    });
    this.saveSync(filtered);
  }
}

export class InMemoryIdempotencyRepository implements IdempotencyRepository {
  kind = "memory" as const;

  private records: IdempotencyRecord[] = [];

  async load(): Promise<IdempotencyRecord[] | null> {
    return this.loadSync();
  }

  save(records: IdempotencyRecord[]): Promise<void> {
    this.saveSync(records);
    return Promise.resolve();
  }

  loadSync(): IdempotencyRecord[] | null {
    return normalizeRecords(this.records).map((record) => ({ ...record }));
  }

  saveSync(records: IdempotencyRecord[]): void {
    this.records = normalizeRecords(records).map((record) => ({ ...record }));
  }

  async has(key: string): Promise<boolean> {
    return this.hasSync(key);
  }

  async put(key: string, value: unknown, ttlMs?: number): Promise<void> {
    this.putSync(key, value, ttlMs);
  }

  hasSync(key: string): boolean {
    return normalizeRecords(this.records).some((record) => record.key === key);
  }

  putSync(key: string, value: unknown, ttlMs?: number): void {
    this.records = normalizeRecords(this.records).filter((record) => record.key !== key);
    this.records.push({
      key,
      value,
      createdAt: new Date().toISOString(),
      expiresAt: ttlMs != null ? Date.now() + ttlMs : undefined,
    });
  }
}
