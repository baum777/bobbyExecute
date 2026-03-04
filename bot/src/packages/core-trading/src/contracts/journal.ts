export type JournalEventType =
  | "CQD_SNAPSHOT" | "DECISION_PREVIEW" | "DECISION_TOKEN"
  | "TRADE_INTENT" | "TRADE_EXECUTION" | "TRADE_VERIFICATION"
  | "POLICY_UPDATE" | "MODEL_CHANGE";

export interface JournalEventV1 {
  schema_version: "journal.event.v1";
  event_id: string;
  ts_ms: number;
  type: JournalEventType;
  payload: unknown;
  prev_event_hash: string | null;
  event_hash: string;
}
