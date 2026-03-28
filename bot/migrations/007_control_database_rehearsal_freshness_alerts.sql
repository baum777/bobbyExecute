CREATE TABLE IF NOT EXISTS control_database_rehearsal_freshness_alerts (
  id text PRIMARY KEY,
  environment text NOT NULL,
  reason_code text NOT NULL,
  severity text NOT NULL,
  status text NOT NULL,
  summary text NOT NULL,
  recommended_action text NOT NULL,
  freshness_status text NOT NULL,
  blocked_by_freshness boolean NOT NULL,
  freshness_window_ms bigint NOT NULL,
  warning_threshold_ms bigint NOT NULL,
  freshness_age_ms bigint,
  last_successful_rehearsal_at timestamptz,
  last_failed_rehearsal_at timestamptz,
  latest_evidence_id text,
  latest_evidence_executed_at timestamptz,
  latest_evidence_status text,
  latest_evidence_execution_source text,
  latest_automated_run_at timestamptz,
  latest_automated_run_status text,
  latest_manual_run_at timestamptz,
  latest_manual_run_status text,
  repeated_automation_failure_count integer NOT NULL DEFAULT 0,
  automation_health text NOT NULL,
  manual_fallback_active boolean NOT NULL DEFAULT false,
  first_seen_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL,
  last_evaluated_at timestamptz NOT NULL,
  acknowledged_at timestamptz,
  acknowledged_by text,
  acknowledgment_note text,
  resolved_at timestamptz,
  resolved_by text,
  resolution_note text,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  record_json jsonb NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS control_database_rehearsal_freshness_alerts_environment_idx
  ON control_database_rehearsal_freshness_alerts (environment);

CREATE INDEX IF NOT EXISTS control_database_rehearsal_freshness_alerts_environment_status_updated_idx
  ON control_database_rehearsal_freshness_alerts (environment, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS control_database_rehearsal_freshness_alert_events (
  id text PRIMARY KEY,
  environment text NOT NULL,
  alert_id text NOT NULL REFERENCES control_database_rehearsal_freshness_alerts (id) ON DELETE CASCADE,
  action text NOT NULL,
  accepted boolean NOT NULL DEFAULT true,
  before_status text,
  after_status text,
  reason_code text,
  summary text,
  note text,
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL,
  event_json jsonb NOT NULL
);

CREATE INDEX IF NOT EXISTS control_database_rehearsal_freshness_alert_events_environment_alert_idx
  ON control_database_rehearsal_freshness_alert_events (environment, alert_id, created_at DESC);

CREATE INDEX IF NOT EXISTS control_database_rehearsal_freshness_alert_events_environment_created_idx
  ON control_database_rehearsal_freshness_alert_events (environment, created_at DESC);
