/**
 * M10: Metrics - histograms, p95 approximation.
 * Wave 4: Time-series persistence for queryable metrics.
 */
import { appendFile, readFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname } from "node:path";

const buckets: Record<string, number[]> = {};

export interface MetricsSnapshot {
  timestamp: string;
  p95: Record<string, number>;
}

export function recordLatency(name: string, ms: number): void {
  if (!buckets[name]) buckets[name] = [];
  buckets[name].push(ms);
  if (buckets[name].length > 1000) buckets[name].shift();
}

export function getP95(name: string): number | undefined {
  const arr = buckets[name];
  if (!arr || arr.length === 0) return undefined;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.ceil(arr.length * 0.95) - 1;
  return sorted[Math.max(0, idx)];
}

export function getAllP95(): Record<string, number> {
  const names = Object.keys(buckets);
  const out: Record<string, number> = {};
  for (const n of names) {
    const v = getP95(n);
    if (v !== undefined) out[n] = v;
  }
  return out;
}

/** Persist current p95 snapshot to JSONL file (Wave 4 P1). */
export async function persistMetricsSnapshot(filePath: string): Promise<void> {
  const p95 = getAllP95();
  if (Object.keys(p95).length === 0) return;

  const dir = dirname(filePath);
  if (!existsSync(dir)) await mkdir(dir, { recursive: true });

  const snapshot: MetricsSnapshot = {
    timestamp: new Date().toISOString(),
    p95,
  };
  await appendFile(filePath, JSON.stringify(snapshot) + "\n", "utf8");
}

/** Load persisted metrics history (Wave 4 P1). */
export async function loadMetricsHistory(
  filePath: string,
  limit = 100
): Promise<MetricsSnapshot[]> {
  if (!existsSync(filePath)) return [];
  const content = await readFile(filePath, "utf8");
  const lines = content.trim().split("\n").filter(Boolean);
  const snapshots = lines.map((l) => JSON.parse(l) as MetricsSnapshot);
  return snapshots.slice(-limit);
}
