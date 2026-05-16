import type {
  WorkerRestartAlertNotificationEventType,
  WorkerRestartAlertNotificationStatus,
  WorkerRestartAlertSeverity,
  WorkerRestartDeliveryJournalFilters,
  WorkerRestartDeliveryTrendFilters,
} from "../../persistence/worker-restart-alert-repository.js";

const DELIVERY_EVENT_TYPES = new Set<WorkerRestartAlertNotificationEventType>([
  "alert_opened",
  "alert_escalated",
  "alert_acknowledged",
  "alert_resolved",
  "alert_repeated_failure_summary",
]);
const DELIVERY_STATUSES = new Set<WorkerRestartAlertNotificationStatus>([
  "sent",
  "failed",
  "suppressed",
  "skipped",
  "pending",
]);
const DELIVERY_SEVERITIES = new Set<WorkerRestartAlertSeverity>(["info", "warning", "critical"]);

function parseDelimitedValues(value: string | undefined): string[] | undefined {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }

  return trimmed
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function parseIsoTimestamp(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }

  const parsed = Date.parse(trimmed);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : undefined;
}

function parseBoundedInteger(value: string | undefined, fallback: number, minimum: number, maximum: number): number {
  const trimmed = value?.trim();
  if (!trimmed) {
    return fallback;
  }

  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(Math.max(parsed, minimum), maximum);
}

export function buildDeliveryFilters(
  query: Record<string, unknown>,
  defaults: { windowMs: number; limit: number }
): WorkerRestartDeliveryJournalFilters {
  const environment = typeof query.environment === "string" ? query.environment.trim() : undefined;
  const destinationName = typeof query.destinationName === "string" ? query.destinationName.trim() : undefined;
  const alertId = typeof query.alertId === "string" ? query.alertId.trim() : undefined;
  const restartRequestId = typeof query.restartRequestId === "string" ? query.restartRequestId.trim() : undefined;
  const formatterProfile = typeof query.formatterProfile === "string" ? query.formatterProfile.trim() : undefined;
  const statuses = parseDelimitedValues(typeof query.status === "string" ? query.status : undefined);
  const rawEventType = query.eventType == null ? undefined : typeof query.eventType === "string" ? query.eventType : null;
  const rawSeverity = query.severity == null ? undefined : typeof query.severity === "string" ? query.severity : null;
  if (rawEventType === null || rawSeverity === null) {
    throw new Error("trend query parameters must be strings");
  }
  const eventTypes = parseDelimitedValues(rawEventType);
  const severities = parseDelimitedValues(rawSeverity);

  if (statuses && statuses.some((status) => !DELIVERY_STATUSES.has(status as WorkerRestartAlertNotificationStatus))) {
    throw new Error("invalid delivery status filter");
  }
  if (eventTypes && eventTypes.some((eventType) => !DELIVERY_EVENT_TYPES.has(eventType as WorkerRestartAlertNotificationEventType))) {
    throw new Error("invalid delivery event type filter");
  }
  if (severities && severities.some((severity) => !DELIVERY_SEVERITIES.has(severity as WorkerRestartAlertSeverity))) {
    throw new Error("invalid delivery severity filter");
  }

  const now = Date.now();
  const toAt = parseIsoTimestamp(typeof query.to === "string" ? query.to : undefined) ?? new Date(now).toISOString();
  const fromAt =
    parseIsoTimestamp(typeof query.from === "string" ? query.from : undefined) ??
    new Date(Date.parse(toAt) - defaults.windowMs).toISOString();

  if (Date.parse(fromAt) > Date.parse(toAt)) {
    throw new Error("delivery window start must be before the end");
  }

  const maxWindowMs = 30 * 24 * 60 * 60 * 1000;
  if (Date.parse(toAt) - Date.parse(fromAt) > maxWindowMs) {
    throw new Error("delivery window is too large");
  }

  return {
    environment: environment || undefined,
    destinationName: destinationName || undefined,
    deliveryStatuses: statuses as WorkerRestartAlertNotificationStatus[] | undefined,
    eventTypes: eventTypes as WorkerRestartAlertNotificationEventType[] | undefined,
    severities: severities as WorkerRestartAlertSeverity[] | undefined,
    alertId: alertId || undefined,
    restartRequestId: restartRequestId || undefined,
    formatterProfile: formatterProfile || undefined,
    windowStartAt: fromAt,
    windowEndAt: toAt,
    limit: parseBoundedInteger(typeof query.limit === "string" ? query.limit : undefined, defaults.limit, 1, 200),
    offset: parseBoundedInteger(typeof query.offset === "string" ? query.offset : undefined, 0, 0, 50_000),
  };
}

export function buildTrendFilters(query: Record<string, unknown>): WorkerRestartDeliveryTrendFilters {
  const allowedKeys = new Set([
    "environment",
    "destinationName",
    "eventType",
    "severity",
    "formatterProfile",
    "referenceEndAt",
    "limit",
  ]);
  for (const key of Object.keys(query)) {
    if (!allowedKeys.has(key)) {
      throw new Error(`invalid trend query parameter: ${key}`);
    }
  }

  const environment =
    query.environment == null ? undefined : typeof query.environment === "string" ? query.environment.trim() : null;
  const destinationName =
    query.destinationName == null ? undefined : typeof query.destinationName === "string" ? query.destinationName.trim() : null;
  const formatterProfile =
    query.formatterProfile == null ? undefined : typeof query.formatterProfile === "string" ? query.formatterProfile.trim() : null;
  if (environment === null || destinationName === null || formatterProfile === null) {
    throw new Error("trend query parameters must be strings");
  }
  const eventTypes = parseDelimitedValues(typeof query.eventType === "string" ? query.eventType : undefined);
  const severities = parseDelimitedValues(typeof query.severity === "string" ? query.severity : undefined);

  if (eventTypes && eventTypes.some((eventType) => !DELIVERY_EVENT_TYPES.has(eventType as WorkerRestartAlertNotificationEventType))) {
    throw new Error("invalid trend event type filter");
  }
  if (severities && severities.some((severity) => !DELIVERY_SEVERITIES.has(severity as WorkerRestartAlertSeverity))) {
    throw new Error("invalid trend severity filter");
  }

  const rawReferenceEndAt =
    query.referenceEndAt == null ? undefined : typeof query.referenceEndAt === "string" ? query.referenceEndAt : null;
  if (rawReferenceEndAt === null) {
    throw new Error("trend query parameters must be strings");
  }
  const referenceEndAt = parseIsoTimestamp(rawReferenceEndAt);
  if (rawReferenceEndAt && !referenceEndAt) {
    throw new Error("trend reference end must be a valid ISO timestamp");
  }

  const rawLimit = query.limit == null ? undefined : typeof query.limit === "string" ? query.limit : null;
  if (rawLimit === null) {
    throw new Error("trend query parameters must be strings");
  }
  let limit = 50;
  if (rawLimit) {
    const parsedLimit = Number.parseInt(rawLimit, 10);
    if (!Number.isFinite(parsedLimit) || parsedLimit < 1 || parsedLimit > 100) {
      throw new Error("trend limit must be an integer between 1 and 100");
    }
    limit = parsedLimit;
  }

  return {
    environment: environment || undefined,
    destinationName: destinationName || undefined,
    eventTypes: eventTypes as WorkerRestartAlertNotificationEventType[] | undefined,
    severities: severities as WorkerRestartAlertSeverity[] | undefined,
    formatterProfile: formatterProfile || undefined,
    referenceEndAt: referenceEndAt ?? undefined,
    limit,
  };
}
