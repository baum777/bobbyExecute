/**
 * Journal repository - mandatory append for audit trail.
 * Normalized planning package: blocks pipeline on write failure (fail-closed).
 */
import type { JournalWriter } from "../journal-writer/writer.js";
import type { JournalEntry } from "../core/contracts/journal.js";

/**
 * Append journal entry. Throws on failure - mandatory write blocks execution.
 * Do not catch and continue; caller must handle or abort.
 */
export async function appendJournal(
  writer: JournalWriter,
  entry: JournalEntry
): Promise<void> {
  await writer.append(entry);
}

/**
 * Query journal by trace ID.
 */
export async function getJournalByTraceId(
  writer: JournalWriter,
  traceId: string
): Promise<JournalEntry[]> {
  return writer.getByTraceId(traceId);
}

/**
 * Query journal by time range.
 */
export async function getJournalRange(
  writer: JournalWriter,
  from: string,
  to: string,
  limit = 100
): Promise<JournalEntry[]> {
  return writer.getRange(from, to, limit);
}
