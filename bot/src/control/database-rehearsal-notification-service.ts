import { randomUUID } from "node:crypto";
import type {
  ControlGovernanceRepository,
  ControlRecoveryRehearsalAlertEventAction,
  ControlRecoveryRehearsalAlertEventRecord,
  ControlRecoveryRehearsalAlertRecord,
  ControlRecoveryRehearsalNotificationDestinationSummary,
  ControlRecoveryRehearsalNotificationEventType,
  ControlRecoveryRehearsalNotificationStatus,
  ControlRecoveryRehearsalNotificationSummary,
  ControlRecoveryRehearsalOperationalStatus,
} from "./control-governance.js";
import { DATABASE_REHEARSAL_REPEATED_AUTOMATION_FAILURE_THRESHOLD } from "./control-governance.js";
import {
  buildNotificationDestinationsFromEnv,
  resolveNotificationRoutes,
  type WorkerRestartNotificationDestinationConfig,
} from "./worker-restart-notification-routing.js";
import {
  createGenericWebhookNotificationSink,
  type NotificationDeliveryStatus,
} from "./worker-restart-notification-service.js";
import type {
  WorkerRestartAlertNotificationEventType,
  WorkerRestartAlertNotificationSummary,
  WorkerRestartAlertRecord,
} from "../persistence/worker-restart-alert-repository.js";

export interface DatabaseRehearsalFreshnessNotificationPayload {
  alertId: string;
  eventType: ControlRecoveryRehearsalNotificationEventType;
  environment: string;
  severity: ControlRecoveryRehearsalAlertRecord["severity"];
  reasonCode: ControlRecoveryRehearsalAlertRecord["reasonCode"];
  summary: string;
  recommendedAction: string;
  freshnessStatus: ControlRecoveryRehearsalOperationalStatus["freshnessStatus"];
  blockedByFreshness: boolean;
  freshnessWindowMs: number;
  warningThresholdMs: number;
  freshnessAgeMs?: number;
  lastSuccessfulRehearsalAt?: string;
  lastFailedRehearsalAt?: string;
  latestEvidenceExecutionSource?: ControlRecoveryRehearsalOperationalStatus["latestEvidenceExecutionSource"];
  latestEvidenceStatus?: ControlRecoveryRehearsalOperationalStatus["latestEvidenceStatus"];
  latestAutomatedRunAt?: string;
  latestAutomatedRunStatus?: ControlRecoveryRehearsalOperationalStatus["latestAutomatedRunStatus"];
  latestManualRunAt?: string;
  latestManualRunStatus?: ControlRecoveryRehearsalOperationalStatus["latestManualRunStatus"];
  repeatedAutomationFailureCount: number;
  automationHealth: ControlRecoveryRehearsalOperationalStatus["automationHealth"];
  manualFallbackActive: boolean;
  latestNotificationStatus?: ControlRecoveryRehearsalNotificationStatus;
  latestNotificationAt?: string;
  operatorPathHint: string;
  metadata?: Record<string, unknown>;
}

export interface DatabaseRehearsalFreshnessNotificationSink {
  kind: string;
  name: string;
  scope: "internal" | "external";
  configured: boolean;
  notify(payload: DatabaseRehearsalFreshnessNotificationPayload): Promise<{
    status: NotificationDeliveryStatus;
    reason?: string;
    responseStatus?: number;
    responseBody?: string;
  }>;
}

export interface DatabaseRehearsalFreshnessNotificationDispatchContext {
  actor: string;
  alert: ControlRecoveryRehearsalAlertRecord;
  status: ControlRecoveryRehearsalOperationalStatus;
  note?: string;
}

export interface DatabaseRehearsalFreshnessNotificationServiceOptions {
  environment: string;
  alertRepository: ControlGovernanceRepository;
  sinks?: DatabaseRehearsalFreshnessNotificationSink[];
  destinations?: WorkerRestartNotificationDestinationConfig[];
  notificationCooldownMs?: number;
  notificationTimeoutMs?: number;
  logger?: Pick<Console, "info" | "warn" | "error">;
}

export interface DatabaseRehearsalFreshnessNotificationResult {
  alert: ControlRecoveryRehearsalAlertRecord;
  notification: ControlRecoveryRehearsalNotificationSummary;
}

interface FreshnessNotificationPlan {
  eventType: ControlRecoveryRehearsalNotificationEventType;
  routingEventType: WorkerRestartAlertNotificationEventType;
  action: ControlRecoveryRehearsalAlertEventAction;
  note: string;
}

interface FormatPayloadOptions {
  destination?: WorkerRestartNotificationDestinationConfig;
  payload: DatabaseRehearsalFreshnessNotificationPayload;
}

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

function buildStructuredSink(
  logger: Pick<Console, "info" | "warn" | "error"> = console
): DatabaseRehearsalFreshnessNotificationSink {
  return {
    kind: "structured_log",
    name: "structured-log",
    scope: "internal",
    configured: true,
    async notify(payload) {
      logger.info("[database-rehearsal-notification] structured", JSON.stringify(payload));
      return {
        status: "sent",
        reason: "structured log recorded",
      };
    },
  };
}

function buildDestinationsFromEnv(
  env: NodeJS.ProcessEnv = process.env
): WorkerRestartNotificationDestinationConfig[] {
  return buildNotificationDestinationsFromEnv(env).destinations;
}

function freshnessEventTypeToRoutingEventType(
  eventType: ControlRecoveryRehearsalNotificationEventType
): WorkerRestartAlertNotificationEventType {
  switch (eventType) {
    case "freshness_recovered":
      return "alert_resolved";
    case "freshness_repeated_failure":
      return "alert_repeated_failure_summary";
    case "freshness_failed_opened":
    case "freshness_stale_opened":
    default:
      return "alert_opened";
  }
}

function selectFreshnessNotificationPlan(
  status: ControlRecoveryRehearsalOperationalStatus,
  alert: ControlRecoveryRehearsalAlertRecord
): FreshnessNotificationPlan | null {
  if (status.freshnessStatus === "stale") {
    return {
      eventType: "freshness_stale_opened",
      routingEventType: "alert_opened",
      action: "opened",
      note: "freshness window expired",
    };
  }

  if (status.freshnessStatus === "failed") {
    if (status.repeatedAutomationFailureCount >= DATABASE_REHEARSAL_REPEATED_AUTOMATION_FAILURE_THRESHOLD) {
      return {
        eventType: "freshness_repeated_failure",
        routingEventType: "alert_repeated_failure_summary",
        action: "updated",
        note: "repeated automated rehearsal failures exceeded the notification threshold",
      };
    }

    return {
      eventType: "freshness_failed_opened",
      routingEventType: "alert_opened",
      action: "opened",
      note: "latest rehearsal failed",
    };
  }

  if (
    status.freshnessStatus === "healthy" &&
    alert.status === "resolved" &&
    alert.notification?.externallyNotified &&
    !alert.notification.recoveryNotificationSent
  ) {
    return {
      eventType: "freshness_recovered",
      routingEventType: "alert_resolved",
      action: "resolved",
      note: "freshness recovered after a previously notified degradation",
    };
  }

  return null;
}

function mapEventAction(status: NotificationDeliveryStatus): ControlRecoveryRehearsalAlertEventAction {
  switch (status) {
    case "sent":
      return "updated";
    case "skipped":
    case "suppressed":
    case "failed":
    case "pending":
    default:
      return "updated";
  }
}

function buildPayload(
  alert: ControlRecoveryRehearsalAlertRecord,
  status: ControlRecoveryRehearsalOperationalStatus,
  plan: FreshnessNotificationPlan
): DatabaseRehearsalFreshnessNotificationPayload {
  return {
    alertId: alert.id,
    eventType: plan.eventType,
    environment: alert.environment,
    severity: alert.severity,
    reasonCode: alert.reasonCode,
    summary: alert.summary,
    recommendedAction: alert.recommendedAction,
    freshnessStatus: status.freshnessStatus,
    blockedByFreshness: status.blockedByFreshness,
    freshnessWindowMs: status.freshnessWindowMs,
    warningThresholdMs: status.warningThresholdMs,
    freshnessAgeMs: status.freshnessAgeMs,
    lastSuccessfulRehearsalAt: status.lastSuccessfulRehearsalAt,
    lastFailedRehearsalAt: status.lastFailedRehearsalAt,
    latestEvidenceExecutionSource: status.latestEvidenceExecutionSource,
    latestEvidenceStatus: status.latestEvidenceStatus,
    latestAutomatedRunAt: status.latestAutomatedRunAt,
    latestAutomatedRunStatus: status.latestAutomatedRunStatus,
    latestManualRunAt: status.latestManualRunAt,
    latestManualRunStatus: status.latestManualRunStatus,
    repeatedAutomationFailureCount: status.repeatedAutomationFailureCount,
    automationHealth: status.automationHealth,
    manualFallbackActive: status.manualFallbackActive,
    latestNotificationStatus: alert.notification?.latestDeliveryStatus,
    latestNotificationAt: alert.notification?.lastAttemptedAt,
    operatorPathHint: "/control/status",
    metadata: {
      latestEvidenceId: status.latestEvidence?.id,
      latestEvidenceExecutedAt: status.latestEvidence?.executedAt,
      latestEvidenceExecutionSource: status.latestEvidenceExecutionSource,
      alertStatus: alert.status,
      notificationEventType: plan.eventType,
      note: plan.note,
    },
  };
}

function formatPayloadForDestination({
  destination,
  payload,
}: FormatPayloadOptions): DatabaseRehearsalFreshnessNotificationPayload & {
  text?: string;
  blocks?: Array<Record<string, unknown>>;
  attachments?: Array<Record<string, unknown>>;
} {
  if (!destination || destination.formatterProfile !== "slack") {
    return payload;
  }

  const title = `${payload.eventType.replaceAll("_", " ")} · ${payload.severity.toUpperCase()}`;
  const text = [
    `${payload.environment} rehearsal freshness`,
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
          { type: "mrkdwn", text: `*Latest Source*\n${payload.latestEvidenceExecutionSource ?? "unknown"}` },
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

function destinationKey(event: ControlRecoveryRehearsalAlertEventRecord): string {
  return safeString(event.notificationDestinationName ?? event.notificationSinkName, "external");
}

function buildDestinationSummary(
  events: ControlRecoveryRehearsalAlertEventRecord[]
): ControlRecoveryRehearsalNotificationDestinationSummary[] {
  const groups = new Map<string, ControlRecoveryRehearsalAlertEventRecord[]>();
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
        (event) => event.notificationEventType === "freshness_recovered" && event.notificationStatus === "sent"
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
      } satisfies ControlRecoveryRehearsalNotificationDestinationSummary;
    })
    .sort((left, right) => {
      const priorityDiff = (left.priority ?? Number.MAX_SAFE_INTEGER) - (right.priority ?? Number.MAX_SAFE_INTEGER);
      if (priorityDiff !== 0) {
        return priorityDiff;
      }
      return left.name.localeCompare(right.name);
    });
}

function buildNotificationSummary(
  events: ControlRecoveryRehearsalAlertEventRecord[]
): ControlRecoveryRehearsalNotificationSummary {
  const notificationEvents = events
    .filter((event) => Boolean(event.notificationEventType) && event.notificationScope === "external")
    .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
  const latest = notificationEvents[0];
  const destinations = buildDestinationSummary(notificationEvents);
  return {
    externallyNotified: destinations.some((destination) => destination.latestDeliveryStatus === "sent"),
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
    recoveryNotificationSent: destinations.some((destination) => destination.recoveryNotificationSent),
    recoveryNotificationAt: destinations.find((destination) => destination.recoveryNotificationSent)?.recoveryNotificationAt,
    selectedDestinationCount: destinations.filter((destination) => destination.selected).length,
    selectedDestinationNames: destinations.filter((destination) => destination.selected).map((destination) => destination.name),
    destinations,
  };
}

function freshnessEventTypeAction(eventType: ControlRecoveryRehearsalNotificationEventType): ControlRecoveryRehearsalAlertEventAction {
  return eventType === "freshness_recovered" ? "resolved" : eventType === "freshness_repeated_failure" ? "updated" : "opened";
}

export class DatabaseRehearsalFreshnessNotificationService {
  constructor(private readonly deps: DatabaseRehearsalFreshnessNotificationServiceOptions) {}

  private get cooldownMs(): number {
    return this.deps.notificationCooldownMs ?? 5 * 60 * 1000;
  }

  private get timeoutMs(): number {
    return this.deps.notificationTimeoutMs ?? 5_000;
  }

  private buildTransportSink(destination: WorkerRestartNotificationDestinationConfig): DatabaseRehearsalFreshnessNotificationSink {
    const transport = createGenericWebhookNotificationSink({
      name: `generic-webhook:${destination.name}`,
      url: destination.url,
      token: destination.token,
      headerName: destination.headerName,
      timeoutMs: this.timeoutMs,
      required: destination.required,
      logger: this.deps.logger,
      bodyType: "database_rehearsal_freshness_alert",
    });
    return {
      kind: transport.kind,
      name: transport.name,
      scope: transport.scope,
      configured: transport.configured,
      async notify(payload) {
        return transport.notify(payload as never);
      },
    };
  }

  private async recordEvent(input: {
    alert: ControlRecoveryRehearsalAlertRecord;
    payload: DatabaseRehearsalFreshnessNotificationPayload | (DatabaseRehearsalFreshnessNotificationPayload & { text?: string; blocks?: Array<Record<string, unknown>>; attachments?: Array<Record<string, unknown>> });
    status: NotificationDeliveryStatus;
    actor: string;
    sink: DatabaseRehearsalFreshnessNotificationSink;
    destination?: WorkerRestartNotificationDestinationConfig;
    note?: string;
    reason?: string;
    routeReason?: string;
    responseStatus?: number;
    responseBody?: string;
    attemptCount?: number;
    scope: "internal" | "external";
    notificationEventType: ControlRecoveryRehearsalNotificationEventType;
  }): Promise<void> {
    const dedupeSource = input.destination?.name ?? input.sink.name;
    const payloadFingerprint = JSON.stringify({
      alertId: input.alert.id,
      eventType: input.notificationEventType,
      destination: dedupeSource,
      payload: input.payload,
    });
    await this.deps.alertRepository.recordDatabaseRehearsalFreshnessAlertEvent({
      id: randomUUID(),
      environment: input.alert.environment,
      alertId: input.alert.id,
      action: freshnessEventTypeAction(input.notificationEventType),
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
        destinationName: input.destination?.name,
        destinationType: input.destination?.slot,
        formatterProfile: input.destination?.formatterProfile,
        destinationPriority: input.destination?.priority,
        destinationTags: input.destination?.tags,
        deliveryStatus: input.status,
        reason: input.reason,
        routeReason: input.routeReason,
        responseStatus: input.responseStatus,
        responseBody: input.responseBody,
      },
      notificationEventType: input.notificationEventType,
      notificationStatus: input.status,
      notificationSinkName: input.sink.name,
      notificationSinkType: input.sink.kind,
      notificationDestinationName: input.destination?.name,
      notificationDestinationType: input.destination?.slot,
      notificationFormatterProfile: input.destination?.formatterProfile,
      notificationDestinationPriority: input.destination?.priority,
      notificationDestinationTags: input.destination?.tags,
      notificationDedupeKey: `${input.alert.id}:${dedupeSource}:${input.notificationEventType}:${payloadFingerprint}`,
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

  private async dispatchInternalSink(
    alert: ControlRecoveryRehearsalAlertRecord,
    payload: DatabaseRehearsalFreshnessNotificationPayload,
    notificationEventType: ControlRecoveryRehearsalNotificationEventType,
    sink: DatabaseRehearsalFreshnessNotificationSink,
    actor: string,
    note?: string
  ): Promise<void> {
    try {
      const delivery = await sink.notify(payload);
      await this.recordEvent({
        alert,
        payload,
        status: delivery.status,
        actor,
        sink,
        note,
        reason: delivery.reason,
        responseStatus: delivery.responseStatus,
        responseBody: delivery.responseBody,
        attemptCount: 1,
        scope: sink.scope,
        notificationEventType,
      });
    } catch (error) {
      await this.recordEvent({
        alert,
        payload,
        status: "failed",
        actor,
        sink,
        note,
        reason: error instanceof Error ? error.message : String(error),
        attemptCount: 1,
        scope: sink.scope,
        notificationEventType,
      });
    }
  }

  private async dispatchExternalDestinations(
    alert: ControlRecoveryRehearsalAlertRecord,
    payload: DatabaseRehearsalFreshnessNotificationPayload,
    notificationEventType: ControlRecoveryRehearsalNotificationEventType,
    previousSummary: ControlRecoveryRehearsalNotificationSummary | undefined,
    actor: string,
    note?: string
  ): Promise<void> {
    const routingEventType = freshnessEventTypeToRoutingEventType(notificationEventType);
    const routes = resolveNotificationRoutes(
      {
        environment: alert.environment,
        alert: {
          environment: alert.environment,
          severity: alert.severity,
          status: alert.status,
        } as unknown as WorkerRestartAlertRecord,
        eventType: routingEventType,
        previousSummary: previousSummary as unknown as WorkerRestartAlertNotificationSummary | undefined,
      },
      this.deps.destinations ?? buildDestinationsFromEnv()
    );

    for (const route of routes) {
      const sink = this.buildTransportSink(route.destination);
      const destinationPayload = formatPayloadForDestination({ destination: route.destination, payload });
      if (route.status === "skipped" || route.status === "suppressed" || route.status === "failed") {
        await this.recordEvent({
          alert,
          payload: destinationPayload,
          status: route.status,
          actor,
          sink,
          destination: route.destination,
          note,
          reason: route.reason,
          routeReason: route.reason,
          attemptCount: 1,
          scope: "external",
          notificationEventType,
        });
        continue;
      }

      try {
        const delivery = await sink.notify(destinationPayload);
        await this.recordEvent({
          alert,
          payload: destinationPayload,
          status: delivery.status,
          actor,
          sink,
          destination: route.destination,
          note,
          reason: delivery.reason,
          routeReason: route.reason,
          responseStatus: delivery.responseStatus,
          responseBody: delivery.responseBody,
          attemptCount: 1,
          scope: "external",
          notificationEventType,
        });
      } catch (error) {
        await this.recordEvent({
          alert,
          payload: destinationPayload,
          status: "failed",
          actor,
          sink,
          destination: route.destination,
          note,
          reason: error instanceof Error ? error.message : String(error),
          routeReason: route.reason,
          attemptCount: 1,
          scope: "external",
          notificationEventType,
        });
      }
    }
  }

  async dispatch(context: DatabaseRehearsalFreshnessNotificationDispatchContext): Promise<DatabaseRehearsalFreshnessNotificationResult | undefined> {
    const plan = selectFreshnessNotificationPlan(context.status, context.alert);
    if (!plan) {
      return undefined;
    }

    const payload = buildPayload(context.alert, context.status, plan);
    const existingEvents = (await this.deps.alertRepository.listDatabaseRehearsalFreshnessAlertEvents(context.alert.environment, 200)).filter(
      (event) => event.alertId === context.alert.id
    );
    const aggregateSummary = buildNotificationSummary(existingEvents);
    const summaryForRouting =
      plan.eventType === "freshness_recovered"
        ? aggregateSummary
        : buildNotificationSummary(existingEvents.filter((event) => event.notificationEventType === plan.eventType));

    const configuredSinks = this.deps.sinks ?? [];
    const internalSink = configuredSinks.find((sink) => sink.scope === "internal") ?? buildStructuredSink(this.deps.logger ?? console);
    if (internalSink) {
      await this.dispatchInternalSink(context.alert, payload, plan.eventType, internalSink, context.actor, context.note ?? plan.note);
    }

    await this.dispatchExternalDestinations(
      context.alert,
      payload,
      plan.eventType,
      summaryForRouting,
      context.actor,
      context.note ?? plan.note
    );

    const refreshedEvents = (await this.deps.alertRepository.listDatabaseRehearsalFreshnessAlertEvents(context.alert.environment, 200)).filter(
      (event) => event.alertId === context.alert.id
    );
    const notification = buildNotificationSummary(refreshedEvents);
    const updatedAlert: ControlRecoveryRehearsalAlertRecord = {
      ...context.alert,
      notification,
      updatedAt: nowIso(),
    };
    await this.deps.alertRepository.saveDatabaseRehearsalFreshnessAlert(updatedAlert);
    return {
      alert: updatedAlert,
      notification,
    };
  }
}
