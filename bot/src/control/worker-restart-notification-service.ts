import { createHash, randomUUID } from "node:crypto";
import type {
  WorkerRestartAlertNotificationEventType,
  WorkerRestartAlertNotificationStatus,
  WorkerRestartAlertNotificationDestinationSummary,
  WorkerRestartAlertNotificationSummary,
  WorkerRestartAlertEventRecord,
  WorkerRestartAlertRecord,
  WorkerRestartAlertRepository,
  WorkerRestartAlertSeverity,
  WorkerRestartAlertSourceCategory,
} from "../persistence/worker-restart-alert-repository.js";
import type { RuntimeWorkerVisibility } from "../persistence/runtime-visibility-repository.js";
import type { RuntimeConfigStatus } from "../config/runtime-config-schema.js";
import {
  type WorkerRestartNotificationDestinationConfig,
  resolveNotificationRoutes,
} from "./worker-restart-notification-routing.js";

export interface WorkerRestartNotificationPayload {
  alertId: string;
  eventType: WorkerRestartAlertNotificationEventType;
  environment: string;
  workerService: string;
  targetWorker?: string;
  severity: WorkerRestartAlertSeverity;
  reasonCode: string;
  summary: string;
  restartRequestId?: string;
  requestedVersionId?: string;
  appliedVersionId?: string;
  lastValidVersionId?: string;
  workerHeartbeatAt?: string;
  workerHeartbeatAgeMs?: number;
  sourceCategory: WorkerRestartAlertSourceCategory;
  recommendedAction: string;
  alertStatus: string;
  occurrenceCount: number;
  operatorPathHint: string;
  metadata?: Record<string, unknown>;
}

export interface WorkerRestartNotificationDispatchContext {
  actor: string;
  alert: WorkerRestartAlertRecord;
  eventType: WorkerRestartAlertNotificationEventType;
  note?: string;
  worker?: RuntimeWorkerVisibility;
  runtimeConfig?: RuntimeConfigStatus;
  repeatedFailureSummary?: boolean;
}

export interface WorkerRestartNotificationDeliveryResult {
  status: WorkerRestartAlertNotificationStatus;
  reason?: string;
  responseStatus?: number;
  responseBody?: string;
}

export interface WorkerRestartNotificationSink {
  kind: string;
  name: string;
  scope: "internal" | "external";
  configured: boolean;
  notify(payload: WorkerRestartNotificationPayload): Promise<WorkerRestartNotificationDeliveryResult>;
}

export interface WorkerRestartNotificationServiceOptions {
  environment: string;
  workerServiceName: string;
  alertRepository: WorkerRestartAlertRepository;
  sinks: WorkerRestartNotificationSink[];
  destinations?: WorkerRestartNotificationDestinationConfig[];
  notificationCooldownMs?: number;
  notificationTimeoutMs?: number;
  logger?: Pick<Console, "info" | "warn" | "error">;
}

export type NotificationSink = WorkerRestartNotificationSink;
export type NotificationDeliveryStatus = WorkerRestartAlertNotificationStatus;
export type NotificationEventType = WorkerRestartAlertNotificationEventType;
export type NotificationSummary = WorkerRestartAlertNotificationSummary;

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function nowIso(): string {
  return new Date().toISOString();
}

function safeString(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : fallback;
}

function workerHeartbeatAgeMs(worker?: RuntimeWorkerVisibility): number | undefined {
  if (!worker?.lastHeartbeatAt) {
    return undefined;
  }

  const parsed = Date.parse(worker.lastHeartbeatAt);
  if (!Number.isFinite(parsed)) {
    return undefined;
  }

  return Math.max(0, Date.now() - parsed);
}

function hashPayload(payload: WorkerRestartNotificationPayload): string {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

function buildPayload(
  alert: WorkerRestartAlertRecord,
  eventType: WorkerRestartAlertNotificationEventType,
  worker?: RuntimeWorkerVisibility,
  runtimeConfig?: RuntimeConfigStatus
): WorkerRestartNotificationPayload {
  const appliedVersionId = runtimeConfig?.appliedVersionId ?? worker?.lastAppliedVersionId ?? alert.lastAppliedVersionId;
  const lastValidVersionId = runtimeConfig?.lastValidVersionId ?? worker?.lastValidVersionId ?? appliedVersionId;
  const requestedVersionId = runtimeConfig?.requestedVersionId ?? alert.requestedVersionId;
  return {
    alertId: alert.id,
    eventType,
    environment: alert.environment,
    workerService: alert.workerService,
    targetWorker: alert.targetWorker,
    severity: alert.severity,
    reasonCode: alert.reasonCode,
    summary: alert.summary,
    restartRequestId: alert.restartRequestId,
    requestedVersionId,
    appliedVersionId,
    lastValidVersionId,
    workerHeartbeatAt: worker?.lastHeartbeatAt ?? alert.lastWorkerHeartbeatAt,
    workerHeartbeatAgeMs: workerHeartbeatAgeMs(worker),
    sourceCategory: alert.sourceCategory,
    recommendedAction: alert.recommendedAction,
    alertStatus: alert.status,
    occurrenceCount: alert.occurrenceCount,
    operatorPathHint: "/control/restart-alerts",
    metadata: {
      targetVersionId: alert.targetVersionId,
      lastRestartRequestStatus: alert.lastRestartRequestStatus,
      lastRestartRequestUpdatedAt: alert.lastRestartRequestUpdatedAt,
      acknowledgedAt: alert.acknowledgedAt,
      resolvedAt: alert.resolvedAt,
    },
  };
}

type FormattedNotificationPayload = WorkerRestartNotificationPayload & {
  text?: string;
  blocks?: Array<Record<string, unknown>>;
  attachments?: Array<Record<string, unknown>>;
};

function destinationKey(event: WorkerRestartAlertEventRecord): string {
  return safeString(event.notificationDestinationName ?? event.notificationSinkName, "external");
}

function latestNotificationEvents(events: WorkerRestartAlertEventRecord[]): WorkerRestartAlertEventRecord[] {
  return events
    .filter((event) => Boolean(event.notificationEventType) && event.notificationScope === "external")
    .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
}

function formatPayloadForDestination(
  destination: WorkerRestartNotificationDestinationConfig | undefined,
  payload: WorkerRestartNotificationPayload
): FormattedNotificationPayload {
  if (!destination || destination.formatterProfile !== "slack") {
    return payload;
  }

  const title = `${payload.eventType.replaceAll("_", " ")} · ${payload.severity.toUpperCase()}`;
  const text = [
    `${payload.environment} ${payload.workerService}`,
    payload.summary,
    `Reason: ${payload.reasonCode}`,
    `Action: ${payload.recommendedAction}`,
  ].join("\n");

  return {
    ...payload,
    text,
    blocks: [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: title,
          emoji: true,
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text,
        },
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Alert*\n${payload.alertId}` },
          { type: "mrkdwn", text: `*Environment*\n${payload.environment}` },
          { type: "mrkdwn", text: `*Severity*\n${payload.severity}` },
          { type: "mrkdwn", text: `*Request*\n${payload.restartRequestId ?? "—"}` },
        ],
      },
    ],
    attachments: [
      {
        color: payload.severity === "critical" ? "danger" : "warning",
        footer: payload.operatorPathHint,
        ts: Math.floor(Date.now() / 1000),
      },
    ],
  };
}

function buildDestinationSummary(events: WorkerRestartAlertEventRecord[]): WorkerRestartAlertNotificationDestinationSummary[] {
  const groups = new Map<string, WorkerRestartAlertEventRecord[]>();
  for (const event of events) {
    if (event.notificationScope !== "external" || !event.notificationEventType) {
      continue;
    }
    const key = destinationKey(event);
    const group = groups.get(key);
    if (group) {
      group.push(event);
    } else {
      groups.set(key, [event]);
    }
  }

  return [...groups.entries()]
    .map(([name, groupedEvents]) => {
      const sorted = [...groupedEvents].sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
      const latest = sorted[0];
      const resolvedEvent = sorted.find(
        (event) => event.notificationEventType === "alert_resolved" && event.notificationStatus === "sent"
      );
      return {
        name,
        sinkType: latest?.notificationSinkType,
        formatterProfile: latest?.notificationFormatterProfile,
        priority: latest?.notificationDestinationPriority,
        selected: groupedEvents.some((event) => Boolean(event.notificationStatus)),
        latestDeliveryStatus: latest?.notificationStatus,
        attemptCount: groupedEvents.length,
        lastAttemptedAt: latest?.createdAt,
        lastFailureReason: latest?.notificationFailureReason,
        suppressionReason: latest?.notificationSuppressionReason,
        routeReason: latest?.notificationRouteReason,
        dedupeKey: latest?.notificationDedupeKey,
        payloadFingerprint: latest?.notificationPayloadFingerprint,
        recoveryNotificationSent: Boolean(resolvedEvent),
        recoveryNotificationAt: resolvedEvent?.createdAt,
      } satisfies WorkerRestartAlertNotificationDestinationSummary;
    })
    .sort((left, right) => {
      const priorityDiff = (left.priority ?? Number.MAX_SAFE_INTEGER) - (right.priority ?? Number.MAX_SAFE_INTEGER);
      if (priorityDiff !== 0) {
        return priorityDiff;
      }
      return left.name.localeCompare(right.name);
    });
}

function shouldNotifyExternally(
  eventType: WorkerRestartAlertNotificationEventType,
  alert: WorkerRestartAlertRecord,
  summary: WorkerRestartAlertNotificationSummary
): boolean {
  if (eventType === "alert_acknowledged") {
    return false;
  }

  if (eventType === "alert_resolved") {
    return summary.externallyNotified;
  }

  if (eventType === "alert_repeated_failure_summary") {
    return alert.sourceCategory === "repeated_restart_failures" && alert.severity === "critical";
  }

  return alert.severity === "critical";
}

function shouldNotifyInternally(_eventType: WorkerRestartAlertNotificationEventType): boolean {
  return true;
}

function mapDeliveryAction(status: WorkerRestartAlertNotificationStatus): WorkerRestartAlertEventRecord["action"] {
  switch (status) {
    case "sent":
      return "notification_sent";
    case "skipped":
      return "notification_skipped";
    case "suppressed":
      return "notification_suppressed";
    case "failed":
    default:
      return "notification_failed";
  }
}

function buildNotificationSummary(events: WorkerRestartAlertEventRecord[]): WorkerRestartAlertNotificationSummary {
  const notificationEvents = latestNotificationEvents(events);
  const latestExternal = notificationEvents[0];
  const latest = latestExternal ?? notificationEvents[0];
  const destinations = buildDestinationSummary(notificationEvents);
  const externallyNotified = destinations.some((destination) => destination.latestDeliveryStatus === "sent");
  const latestResolution = notificationEvents.find((event) => event.notificationEventType === "alert_resolved" && event.notificationStatus === "sent");

  return {
    externallyNotified,
    sinkName: latest?.notificationSinkName,
    sinkType: latest?.notificationSinkType,
    latestDestinationName: latest?.notificationDestinationName,
    latestDestinationType: latest?.notificationDestinationType,
    latestFormatterProfile: latest?.notificationFormatterProfile,
    eventType: latest?.notificationEventType,
    latestDeliveryStatus: latest?.notificationStatus,
    attemptCount: notificationEvents.length,
    lastAttemptedAt: latest?.createdAt,
    lastFailureReason: latest?.notificationFailureReason,
    suppressionReason: latest?.notificationSuppressionReason,
    dedupeKey: latest?.notificationDedupeKey,
    payloadFingerprint: latest?.notificationPayloadFingerprint,
    resolutionNotificationSent: latestResolution ? true : false,
    resolutionNotificationAt: latestResolution?.createdAt,
    selectedDestinationCount: destinations.length,
    selectedDestinationNames: destinations.map((destination) => destination.name),
    destinations,
  };
}

export class WorkerRestartNotificationService {
  constructor(private readonly deps: WorkerRestartNotificationServiceOptions) {}

  private get cooldownMs(): number {
    return this.deps.notificationCooldownMs ?? 5 * 60 * 1000;
  }

  private get timeoutMs(): number {
    return this.deps.notificationTimeoutMs ?? 5000;
  }

  private async loadEvents(alertId: string): Promise<WorkerRestartAlertEventRecord[]> {
    return this.deps.alertRepository.listEvents(this.deps.environment, alertId, 200);
  }

  async summarize(alertId: string): Promise<WorkerRestartAlertNotificationSummary> {
    return buildNotificationSummary(await this.loadEvents(alertId));
  }

  async summarizeAlert(alert: WorkerRestartAlertRecord): Promise<WorkerRestartAlertRecord> {
    const notification = await this.summarize(alert.id);
    return {
      ...clone(alert),
      notification,
    };
  }

  async summarizeAlerts(alerts: WorkerRestartAlertRecord[]): Promise<WorkerRestartAlertRecord[]> {
    const summarized: WorkerRestartAlertRecord[] = [];
    for (const alert of alerts) {
      summarized.push(await this.summarizeAlert(alert));
    }
    return summarized;
  }

  private async recordNotificationEvent(input: {
    alert: WorkerRestartAlertRecord;
    payload: WorkerRestartNotificationPayload;
    status: WorkerRestartAlertNotificationStatus;
    actor: string;
    sink: WorkerRestartNotificationSink;
    destination?: WorkerRestartNotificationDestinationConfig;
    note?: string;
    reason?: string;
    routeReason?: string;
    responseStatus?: number;
    responseBody?: string;
    attemptCount?: number;
    scope: "internal" | "external";
  }): Promise<void> {
    const destinationName = input.destination?.name;
    const dedupeSource = destinationName ?? input.sink.name;
    const payloadFingerprint = hashPayload(input.payload);
    await this.deps.alertRepository.recordEvent({
      id: randomUUID(),
      environment: input.alert.environment,
      alertId: input.alert.id,
      action: mapDeliveryAction(input.status),
      actor: input.actor,
      accepted: input.status === "sent",
      beforeStatus: input.alert.status,
      afterStatus: input.alert.status,
      reasonCode: input.alert.reasonCode,
      summary: input.alert.summary,
      note: input.note,
      metadata: {
        payload: clone(input.payload),
        sinkName: input.sink.name,
        sinkType: input.sink.kind,
        destinationName,
        destinationType: input.destination?.slot,
        formatterProfile: input.destination?.formatterProfile,
        destinationPriority: input.destination?.priority,
        destinationTags: input.destination?.tags,
        deliveryStatus: input.status,
        reason: input.reason,
        routeReason: input.routeReason,
        responseStatus: input.responseStatus,
        responseBody: input.responseBody,
        attemptCount: input.attemptCount ?? 1,
      },
      notificationSinkName: input.sink.name,
      notificationSinkType: input.sink.kind,
      notificationDestinationName: destinationName,
      notificationDestinationType: input.destination?.slot,
      notificationFormatterProfile: input.destination?.formatterProfile,
      notificationDestinationPriority: input.destination?.priority,
      notificationDestinationTags: input.destination?.tags,
      notificationEventType: input.payload.eventType,
      notificationStatus: input.status,
      notificationDedupeKey: `${input.alert.id}:${dedupeSource}:${input.payload.eventType}:${payloadFingerprint}`,
      notificationPayloadFingerprint: payloadFingerprint,
      notificationAttemptCount: input.attemptCount ?? 1,
      notificationFailureReason: input.reason,
      notificationSuppressionReason:
        input.status === "skipped" || input.status === "suppressed" ? input.reason : undefined,
      notificationRouteReason: input.routeReason,
      notificationResponseStatus: input.responseStatus,
      notificationResponseBody: input.responseBody,
      notificationScope: input.scope,
      createdAt: nowIso(),
    });
  }

  private buildTransportSink(destination: WorkerRestartNotificationDestinationConfig): WorkerRestartNotificationSink {
    return createGenericWebhookNotificationSink({
      name: `generic-webhook:${destination.name}`,
      url: destination.url,
      token: destination.token,
      headerName: destination.headerName,
      timeoutMs: this.timeoutMs,
      required: destination.required,
      logger: this.deps.logger,
    });
  }

  private async dispatchInternalSinks(
    context: WorkerRestartNotificationDispatchContext,
    payload: WorkerRestartNotificationPayload
  ): Promise<void> {
    for (const sink of this.deps.sinks.filter((candidate) => candidate.scope === "internal")) {
      if (!shouldNotifyInternally(context.eventType)) {
        await this.recordNotificationEvent({
          alert: context.alert,
          payload,
          status: "skipped",
          actor: context.actor,
          sink,
          note: context.note,
          reason: "internal notification policy skipped",
          routeReason: "internal notification policy skipped",
          attemptCount: 1,
          scope: sink.scope,
        });
        continue;
      }

      try {
        const delivery = await sink.notify(payload);
        await this.recordNotificationEvent({
          alert: context.alert,
          payload,
          status: delivery.status,
          actor: context.actor,
          sink,
          note: context.note,
          reason: delivery.reason,
          responseStatus: delivery.responseStatus,
          responseBody: delivery.responseBody,
          attemptCount: 1,
          scope: sink.scope,
        });
      } catch (error) {
        await this.recordNotificationEvent({
          alert: context.alert,
          payload,
          status: "failed",
          actor: context.actor,
          sink,
          note: context.note,
          reason: error instanceof Error ? error.message : String(error),
          attemptCount: 1,
          scope: sink.scope,
        });
      }
    }
  }

  private async dispatchLegacyExternalSinks(
    context: WorkerRestartNotificationDispatchContext,
    payload: WorkerRestartNotificationPayload,
    summary: WorkerRestartAlertNotificationSummary,
    events: WorkerRestartAlertEventRecord[],
  ): Promise<void> {
    const now = Date.now();
    for (const sink of this.deps.sinks.filter((candidate) => candidate.scope === "external")) {
      if (!shouldNotifyExternally(context.eventType, context.alert, summary)) {
        await this.recordNotificationEvent({
          alert: context.alert,
          payload,
          status: "skipped",
          actor: context.actor,
          sink,
          note: context.note,
          reason: "policy is local-only for this event",
          routeReason: "legacy policy local-only",
          attemptCount: 1,
          scope: sink.scope,
        });
        continue;
      }

      const sinkEvents = events.filter(
        (event) => event.notificationSinkName === sink.name && event.notificationEventType === context.eventType
      );
      const latestSinkEvent = sinkEvents[0];
      if (latestSinkEvent && now - Date.parse(latestSinkEvent.createdAt) < this.cooldownMs) {
        await this.recordNotificationEvent({
          alert: context.alert,
          payload,
          status: "suppressed",
          actor: context.actor,
          sink,
          note: context.note,
          reason: `cooldown active for ${sink.name}`,
          routeReason: `cooldown active for ${sink.name}`,
          attemptCount: sinkEvents.length + 1,
          scope: sink.scope,
        });
        continue;
      }

      if (!sink.configured) {
        await this.recordNotificationEvent({
          alert: context.alert,
          payload,
          status: "failed",
          actor: context.actor,
          sink,
          note: context.note,
          reason: `${sink.kind} sink is not configured`,
          routeReason: `${sink.kind} sink is not configured`,
          attemptCount: sinkEvents.length + 1,
          scope: sink.scope,
        });
        continue;
      }

      try {
        const delivery = await sink.notify(payload);
        await this.recordNotificationEvent({
          alert: context.alert,
          payload,
          status: delivery.status,
          actor: context.actor,
          sink,
          note: context.note,
          reason: delivery.reason,
          responseStatus: delivery.responseStatus,
          responseBody: delivery.responseBody,
          attemptCount: sinkEvents.length + 1,
          scope: sink.scope,
        });
      } catch (error) {
        await this.recordNotificationEvent({
          alert: context.alert,
          payload,
          status: "failed",
          actor: context.actor,
          sink,
          note: context.note,
          reason: error instanceof Error ? error.message : String(error),
          attemptCount: sinkEvents.length + 1,
          scope: sink.scope,
        });
      }
    }
  }

  private async dispatchRoutedDestinations(
    context: WorkerRestartNotificationDispatchContext,
    payload: WorkerRestartNotificationPayload,
    summary: WorkerRestartAlertNotificationSummary,
    events: WorkerRestartAlertEventRecord[]
  ): Promise<void> {
    const routes = resolveNotificationRoutes(
      {
        environment: context.alert.environment,
        alert: context.alert,
        eventType: context.eventType,
        previousSummary: summary,
      },
      this.deps.destinations ?? []
    );

    for (const route of routes) {
      const destinationEvents = events.filter(
        (event) =>
          event.notificationScope === "external" &&
          event.notificationEventType === context.eventType &&
          (event.notificationDestinationName ?? event.notificationSinkName) === route.destination.name
      );
      const sink = this.buildTransportSink(route.destination);
      const destinationPayload = formatPayloadForDestination(route.destination, payload);

      if (route.status === "skipped" || route.status === "suppressed" || route.status === "failed") {
        await this.recordNotificationEvent({
          alert: context.alert,
          payload: destinationPayload,
          status: route.status,
          actor: context.actor,
          sink,
          destination: route.destination,
          note: context.note,
          reason: route.reason,
          routeReason: route.reason,
          attemptCount: destinationEvents.length + 1,
          scope: "external",
        });
        continue;
      }

      try {
        const delivery = await sink.notify(destinationPayload);
        await this.recordNotificationEvent({
          alert: context.alert,
          payload: destinationPayload,
          status: delivery.status,
          actor: context.actor,
          sink,
          destination: route.destination,
          note: context.note,
          reason: delivery.reason,
          routeReason: route.reason,
          responseStatus: delivery.responseStatus,
          responseBody: delivery.responseBody,
          attemptCount: destinationEvents.length + 1,
          scope: "external",
        });
      } catch (error) {
        await this.recordNotificationEvent({
          alert: context.alert,
          payload: destinationPayload,
          status: "failed",
          actor: context.actor,
          sink,
          destination: route.destination,
          note: context.note,
          reason: error instanceof Error ? error.message : String(error),
          routeReason: route.reason,
          attemptCount: destinationEvents.length + 1,
          scope: "external",
        });
      }
    }
  }

  async dispatch(context: WorkerRestartNotificationDispatchContext): Promise<WorkerRestartAlertNotificationSummary> {
    const payload = buildPayload(context.alert, context.eventType, context.worker, context.runtimeConfig);
    const events = await this.loadEvents(context.alert.id);
    const summary = buildNotificationSummary(events);

    await this.dispatchInternalSinks(context, payload);

    if (this.deps.destinations && this.deps.destinations.length > 0) {
      await this.dispatchRoutedDestinations(context, payload, summary, events);
    } else {
      await this.dispatchLegacyExternalSinks(context, payload, summary, events);
    }

    return this.summarize(context.alert.id);
  }
}

export function createStructuredWorkerRestartNotificationSink(
  logger: Pick<Console, "info" | "warn" | "error"> = console
): WorkerRestartNotificationSink {
  return {
    kind: "structured_log",
    name: "structured-log",
    scope: "internal",
    configured: true,
    async notify(payload) {
      const logPayload = {
        eventType: payload.eventType,
        alertId: payload.alertId,
        environment: payload.environment,
        workerService: payload.workerService,
        severity: payload.severity,
        reasonCode: payload.reasonCode,
        summary: payload.summary,
        restartRequestId: payload.restartRequestId,
        requestedVersionId: payload.requestedVersionId,
        appliedVersionId: payload.appliedVersionId,
        workerHeartbeatAgeMs: payload.workerHeartbeatAgeMs,
        recommendedAction: payload.recommendedAction,
      };

      logger.info("[restart-notification] structured", JSON.stringify(logPayload));
      return {
        status: "sent",
        reason: "structured log recorded",
      };
    },
  };
}

export function createGenericWebhookNotificationSink(options: {
  name?: string;
  url?: string;
  token?: string;
  headerName?: string;
  timeoutMs?: number;
  required?: boolean;
  logger?: Pick<Console, "info" | "warn" | "error">;
  bodyType?: string;
}): WorkerRestartNotificationSink {
  const headerName = safeString(options.headerName, "authorization");
  return {
    kind: "generic_webhook",
    name: safeString(options.name, "webhook"),
    scope: "external",
    configured: Boolean(options.url?.trim()),
    async notify(payload) {
      const url = options.url?.trim();
      if (!url) {
        if (options.required) {
          return {
            status: "failed",
            reason: "webhook configuration is missing",
          };
        }
        return {
          status: "skipped",
          reason: "webhook sink disabled",
        };
      }

      let parsed: URL;
      try {
        parsed = new URL(url);
      } catch {
        return {
          status: "failed",
          reason: "webhook URL is malformed",
        };
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), Math.max(1000, options.timeoutMs ?? 5000));
      const body = JSON.stringify({
        type: options.bodyType ?? "worker_restart_alert",
        ...payload,
      });
      const headers = new Headers({
        "content-type": "application/json",
      });
      if (options.token?.trim()) {
        headers.set(headerName, headerName.toLowerCase() === "authorization" ? `Bearer ${options.token.trim()}` : options.token.trim());
      }

      try {
        const response = await fetch(parsed, {
          method: "POST",
          headers,
          body,
          signal: controller.signal,
        });
        const responseBody = await response.text();
        if (!response.ok) {
          return {
            status: "failed",
            reason: `webhook responded with ${response.status}`,
            responseStatus: response.status,
            responseBody,
          };
        }
        return {
          status: "sent",
          reason: "webhook delivered",
          responseStatus: response.status,
          responseBody,
        };
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        return {
          status: "failed",
          reason,
        };
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}
