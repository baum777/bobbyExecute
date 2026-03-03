/**
 * Journal agent - append-only audit logging.
 * PROPOSED - integrates with ActionLogger.
 */
import type { ActionLogger } from "../observability/action-log.js";
import type { JournalEntry } from "../core/contracts/journal.js";

export function createJournalHandler(
  logger: ActionLogger
): (entry: JournalEntry) => Promise<void> {
  return async (entry) => {
    await logger.append({
      agentId: "journal-agent",
      userId: "system",
      action: "journal.append",
      input: entry.input,
      output: entry.output,
      ts: entry.timestamp,
      blocked: entry.blocked,
      reason: entry.reason,
      traceId: entry.traceId,
    });
  };
}
