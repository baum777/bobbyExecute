/**
 * Memory module - MemoryDB, Log, iterative renewal.
 * Version: 1.0.0 | Owner: Kimi Swarm | Layer: memory | Last Updated: 2026-03-04
 * @deprecated legacy non-canonical compatibility barrel.
 * Zero-authority residue only. Retained temporarily for migration/test support only; no new production callers.
 * No canonical decision-history authority.
 */
export { MemoryDB, type MemorySnapshot, type CompressedJournalEntry } from "./memory-db.js";
export { MemoryLog, type LogEntry, type LogAck } from "./log-append.js";
