import { afterEach, describe, expect, it, vi } from "vitest";
import {
  InMemoryWorkerRestartAlertRepository,
  type WorkerRestartAlertRecord,
} from "../../src/persistence/worker-restart-alert-repository.js";
import {
  WorkerRestartNotificationService,
  createGenericWebhookNotificationSink,
  createStructuredWorkerRestartNotificationSink,
} from "../../src/control/worker-restart-notification-service.js";

function nowIso(): string {
  return new Date().toISOString();
}

function buildAlert(overrides: Partial<WorkerRestartAlertRecord> = {}): WorkerRestartAlertRecord {
  const now = nowIso();
  return {
    id: "alert-1",
    environment: "test",
    dedupeKey: "request:restart-1",
    restartRequestId: "restart-1",
    workerService: "mock-runtime-worker",
    targetWorker: "mock-runtime-worker",
    targetVersionId: "version-1",
    sourceCategory: "convergence_timeout",
    reasonCode: "convergence_timeout",
    severity: "critical",
    status: "open",
    summary: "worker restart has not converged",
    recommendedAction: "inspect the worker restart path",
    metadata: {
      requestedAt: now,
    },
    conditionSignature: "signature-1",
    occurrenceCount: 1,
    firstSeenAt: now,
    lastSeenAt: now,
    lastEvaluatedAt: now,
    lastRestartRequestStatus: "requested",
    lastRestartRequestUpdatedAt: now,
    lastWorkerHeartbeatAt: now,
    lastAppliedVersionId: "version-1",
    requestedVersionId: "version-1",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

async function createHarness(options: {
  sinks?: ConstructorParameters<typeof WorkerRestartNotificationService>[0]["sinks"];
  cooldownMs?: number;
} = {}) {
  const alertRepository = new InMemoryWorkerRestartAlertRepository();
  const service = new WorkerRestartNotificationService({
    environment: "test",
    workerServiceName: "mock-runtime-worker",
    alertRepository,
    sinks:
      options.sinks ??
      [createStructuredWorkerRestartNotificationSink(console)],
    notificationCooldownMs: options.cooldownMs ?? 60_000,
    logger: console,
  });
  const alert = await alertRepository.save(buildAlert());
  return { alertRepository, service, alert };
}

describe("worker restart notification service", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("sends external notifications for critical alert openings", async () => {
    const notify = vi.fn().mockResolvedValue({
      status: "sent",
      reason: "delivered",
      responseStatus: 202,
    });
    const { service, alertRepository, alert } = await createHarness({
      sinks: [
        {
          kind: "generic_webhook",
          name: "alert-webhook",
          scope: "external",
          configured: true,
          notify,
        },
      ],
    });

    const summary = await service.dispatch({
      actor: "system",
      alert,
      eventType: "alert_opened",
    });

    expect(notify).toHaveBeenCalledTimes(1);
    expect(summary.externallyNotified).toBe(true);
    expect(summary.latestDeliveryStatus).toBe("sent");

    const events = await alertRepository.listEvents("test", alert.id);
    expect(events.map((event) => event.action)).toContain("notification_sent");
    expect(events[0]?.notificationStatus).toBe("sent");
  });

  it("skips warning alert openings when policy is local-only", async () => {
    const notify = vi.fn();
    const { service, alertRepository, alert } = await createHarness({
      sinks: [
        {
          kind: "generic_webhook",
          name: "alert-webhook",
          scope: "external",
          configured: true,
          notify,
        },
      ],
    });
    const warningAlert = await alertRepository.save(buildAlert({ severity: "warning" }));

    const summary = await service.dispatch({
      actor: "system",
      alert: warningAlert,
      eventType: "alert_opened",
    });

    expect(notify).not.toHaveBeenCalled();
    expect(summary.externallyNotified).toBe(false);
    expect(summary.latestDeliveryStatus).toBe("skipped");

    const events = await alertRepository.listEvents("test", warningAlert.id);
    expect(events.some((event) => event.notificationStatus === "skipped")).toBe(true);
  });

  it("sends escalation notifications when an alert becomes critical", async () => {
    const notify = vi.fn().mockResolvedValue({
      status: "sent",
      reason: "delivered",
      responseStatus: 202,
    });
    const { service, alert } = await createHarness({
      sinks: [
        {
          kind: "generic_webhook",
          name: "alert-webhook",
          scope: "external",
          configured: true,
          notify,
        },
      ],
    });

    const escalated = await service.dispatch({
      actor: "system",
      alert: { ...alert, severity: "critical" },
      eventType: "alert_escalated",
    });

    expect(notify).toHaveBeenCalledTimes(1);
    expect(escalated.latestDeliveryStatus).toBe("sent");
  });

  it("suppresses repeated sends inside the cooldown window", async () => {
    const notify = vi.fn().mockResolvedValue({
      status: "sent",
      reason: "delivered",
      responseStatus: 202,
    });
    const { service, alertRepository, alert } = await createHarness({
      cooldownMs: 60 * 60 * 1000,
      sinks: [
        {
          kind: "generic_webhook",
          name: "alert-webhook",
          scope: "external",
          configured: true,
          notify,
        },
      ],
    });

    await service.dispatch({
      actor: "system",
      alert,
      eventType: "alert_opened",
    });
    await service.dispatch({
      actor: "system",
      alert,
      eventType: "alert_opened",
    });

    expect(notify).toHaveBeenCalledTimes(1);
    const events = await alertRepository.listEvents("test", alert.id);
    expect(events.some((event) => event.notificationStatus === "suppressed")).toBe(true);
  });

  it("sends a recovery notification when a previously notified critical alert resolves", async () => {
    const notify = vi.fn().mockResolvedValue({
      status: "sent",
      reason: "delivered",
      responseStatus: 202,
    });
    const { service, alert } = await createHarness({
      sinks: [
        {
          kind: "generic_webhook",
          name: "alert-webhook",
          scope: "external",
          configured: true,
          notify,
        },
      ],
    });

    await service.dispatch({
      actor: "system",
      alert,
      eventType: "alert_opened",
    });
    const resolved = await service.dispatch({
      actor: "system",
      alert: { ...alert, status: "resolved", resolvedAt: nowIso() },
      eventType: "alert_resolved",
    });

    expect(notify).toHaveBeenCalledTimes(2);
    expect(resolved.externallyNotified).toBe(true);
    expect(resolved.latestDeliveryStatus).toBe("sent");
  });

  it("fails closed when webhook config is missing", async () => {
    const { service, alertRepository, alert } = await createHarness({
      sinks: [
        createGenericWebhookNotificationSink({
          name: "alert-webhook",
          required: true,
          timeoutMs: 1000,
        }),
      ],
    });

    const summary = await service.dispatch({
      actor: "system",
      alert,
      eventType: "alert_opened",
    });

    expect(summary.latestDeliveryStatus).toBe("failed");
    expect(summary.lastFailureReason).toMatch(/configured/i);
    const events = await alertRepository.listEvents("test", alert.id);
    expect(events.some((event) => event.notificationStatus === "failed")).toBe(true);
  });

  it("records failed deliveries for non-2xx webhook responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 503,
        text: async () => "service unavailable",
      })) as typeof fetch
    );

    const { service, alertRepository, alert } = await createHarness({
      sinks: [
        createGenericWebhookNotificationSink({
          name: "alert-webhook",
          url: "https://alerts.example.test/webhook",
          token: "secret-token",
          timeoutMs: 1000,
        }),
      ],
    });

    const summary = await service.dispatch({
      actor: "system",
      alert,
      eventType: "alert_opened",
    });

    expect(summary.latestDeliveryStatus).toBe("failed");
    const events = await alertRepository.listEvents("test", alert.id);
    expect(events[0]?.notificationResponseStatus).toBe(503);
    expect(events[0]?.notificationFailureReason).toContain("503");
  });

  it("keeps canonical alert state intact when a sink throws", async () => {
    const { service, alertRepository, alert } = await createHarness({
      sinks: [
        {
          kind: "generic_webhook",
          name: "alert-webhook",
          scope: "external",
          configured: true,
          async notify() {
            throw new Error("boom");
          },
        },
      ],
    });

    const before = await alertRepository.load("test", alert.id);
    const summary = await service.dispatch({
      actor: "system",
      alert,
      eventType: "alert_opened",
    });
    const after = await alertRepository.load("test", alert.id);

    expect(after).toMatchObject(before ?? {});
    expect(summary.latestDeliveryStatus).toBe("failed");
    expect(after).toBeTruthy();
  });
});
