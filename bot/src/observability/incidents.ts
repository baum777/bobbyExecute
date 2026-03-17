/**
 * Incident counters + runtime incident recorder.
 */
import type {
  IncidentRecord,
  IncidentRepository,
  IncidentSeverity,
} from "../persistence/incident-repository.js";

const counters: Record<string, number> = {};

export function incrementIncident(adapterId: string, errorType?: string): void {
  const key = errorType ? `${adapterId}:${errorType}` : adapterId;
  counters[key] = (counters[key] ?? 0) + 1;
}

export function getIncidentCount(adapterId?: string): number | Record<string, number> {
  if (!adapterId) return { ...counters };
  return Object.entries(counters)
    .filter(([k]) => k.startsWith(adapterId))
    .reduce((s, [, v]) => s + v, 0);
}

export interface IncidentRecorder {
  record(input: {
    severity: IncidentSeverity;
    type: IncidentRecord["type"];
    message: string;
    details?: IncidentRecord["details"];
    at?: string;
    id?: string;
  }): Promise<IncidentRecord>;
  list(limit?: number): Promise<IncidentRecord[]>;
}

export class RepositoryIncidentRecorder implements IncidentRecorder {
  private sequence = 0;

  constructor(private readonly repository: IncidentRepository) {}

  async record(input: {
    severity: IncidentSeverity;
    type: IncidentRecord["type"];
    message: string;
    details?: IncidentRecord["details"];
    at?: string;
    id?: string;
  }): Promise<IncidentRecord> {
    const at = input.at ?? new Date().toISOString();
    this.sequence += 1;
    const id = input.id ?? `incident-${at.replace(/[:.]/g, "-")}-${this.sequence}`;
    const record: IncidentRecord = {
      id,
      at,
      severity: input.severity,
      type: input.type,
      message: input.message,
      details: input.details,
    };
    await this.repository.append(record);
    return record;
  }

  async list(limit = 100): Promise<IncidentRecord[]> {
    return this.repository.list(limit);
  }
}
