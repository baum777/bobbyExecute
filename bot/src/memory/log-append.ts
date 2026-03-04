/**
 * Memory Log Append - Append-only mit SHA-256 Hash-Chain.
 * Version: 1.0.0 | Owner: Kimi Swarm | Layer: memory | Last Updated: 2026-03-04
 */
import { sha256 } from "../core/determinism/hash.js";
import { canonicalize } from "../core/determinism/canonicalize.js";

export interface LogEntry {
  traceId: string;
  timestamp: string;
  stage: string;
  decisionHash?: string;
  resultHash?: string;
  input: unknown;
  output: unknown;
}

export interface LogAck {
  seqId: number;
  hash: string;
  prevHash?: string;
  timestamp: string;
}

export class MemoryLog {
  private entries: LogEntry[] = [];
  private seqId = 0;
  private lastHash: string | null = null;

  append(entry: LogEntry): LogAck {
    const prevHash = this.lastHash ?? undefined;
    const canonical = canonicalize({ prevHash, entry });
    const hash = sha256(canonical);
    this.entries.push(entry);
    this.seqId += 1;
    this.lastHash = hash;
    return {
      seqId: this.seqId,
      hash,
      prevHash,
      timestamp: entry.timestamp,
    };
  }

  getEntries(): readonly LogEntry[] {
    return this.entries;
  }

  getChainHash(): string | null {
    return this.lastHash;
  }
}
