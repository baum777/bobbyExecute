import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildDashboardSessionCookie } from "../../../dashboard/src/lib/operator-auth.ts";
import type { DashboardOperatorSession } from "../../../dashboard/src/types/api.ts";

const { forwardControlRequestMock } = vi.hoisted(() => ({
  forwardControlRequestMock: vi.fn(),
}));

vi.mock("../../../dashboard/src/lib/control-client.ts", () => ({
  forwardControlRequest: forwardControlRequestMock,
  resolveControlServiceToken: () => "test-control-token",
}));

import { GET, POST } from "../../../dashboard/src/app/api/control/[...path]/route.ts";

const DASHBOARD_SESSION_SECRET = "dashboard-session-secret";

function buildSessionCookie(role: DashboardOperatorSession["role"] = "admin"): string {
  const nowMs = Date.now();
  const session: DashboardOperatorSession = {
    sessionId: `session-${role}`,
    actorId: `operator-${role}`,
    displayName: `Operator ${role}`,
    role,
    issuedAt: new Date(nowMs - 5 * 60 * 1000).toISOString(),
    expiresAt: new Date(nowMs + 60 * 60 * 1000).toISOString(),
  };
  const cookie = buildDashboardSessionCookie(session, {
    DASHBOARD_SESSION_SECRET,
  });
  return `${cookie.name}=${cookie.value}`;
}

describe("dashboard control proxy", () => {
  beforeEach(() => {
    forwardControlRequestMock.mockReset();
    process.env.DASHBOARD_SESSION_SECRET = DASHBOARD_SESSION_SECRET;
  });

  it("forwards restart-worker through the server-side proxy without exposing secrets", async () => {
    forwardControlRequestMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          accepted: true,
          message: "worker restart dispatched",
        }),
        {
          status: 202,
          headers: {
            "content-type": "application/json",
          },
        }
      )
    );

    const request = new Request("http://localhost/api/control/restart-worker", {
      method: "POST",
      headers: {
        cookie: buildSessionCookie("admin"),
        "content-type": "application/json",
        "x-idempotency-key": "restart-123",
        "x-request-id": "request-abc",
      },
      body: JSON.stringify({ reason: "paper promotion" }),
    });

    const response = await POST(request as any, { params: Promise.resolve({ path: ["restart-worker"] }) } as any);

    expect(forwardControlRequestMock).toHaveBeenCalledTimes(1);
    const [forwardPath, forwardInit] = forwardControlRequestMock.mock.calls[0] as [
      string,
      { headers?: HeadersInit; method?: string; body?: string },
      NodeJS.ProcessEnv,
    ];
    expect(forwardPath).toBe("/control/restart-worker");
    expect(forwardInit.method).toBe("POST");
    expect(forwardInit.body).toBe(JSON.stringify({ reason: "paper promotion" }));

    const forwardedHeaders = new Headers(forwardInit.headers);
    expect(forwardedHeaders.get("x-idempotency-key")).toBe("restart-123");
    expect(forwardedHeaders.get("x-request-id")).toBe("request-abc");
    expect(forwardedHeaders.get("authorization")).toBeNull();
    expect(forwardedHeaders.get("x-control-token")).toBeNull();

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      accepted: true,
      message: "worker restart dispatched",
    });
  });

  it("forwards restart-alert reads and acknowledge actions through the server-side proxy without exposing secrets", async () => {
    forwardControlRequestMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          success: true,
          summary: {
            environment: "test",
            workerService: "mock-runtime-worker",
            openAlertCount: 1,
            acknowledgedAlertCount: 0,
            resolvedAlertCount: 0,
            activeAlertCount: 1,
            stalledRestartCount: 1,
            divergenceAlerting: true,
            openSourceCategories: ["restart_timeout"],
            externalNotificationCount: 1,
            notificationFailureCount: 0,
            notificationSuppressedCount: 0,
            latestNotificationStatus: "sent",
            latestNotificationAt: "2026-01-01T00:00:00.000Z",
            latestDestinationName: "primary",
            latestDestinationType: "primary",
            latestFormatterProfile: "generic",
            selectedDestinationCount: 1,
            selectedDestinationNames: ["primary"],
            destinations: [
              {
                name: "primary",
                sinkType: "generic_webhook",
                formatterProfile: "generic",
                priority: 10,
                selected: true,
                latestDeliveryStatus: "sent",
                attemptCount: 1,
                lastAttemptedAt: "2026-01-01T00:00:00.000Z",
                routeReason: "destination selected by routing policy",
                dedupeKey: "notification-1",
                payloadFingerprint: "payload-1",
                recoveryNotificationSent: true,
                recoveryNotificationAt: "2026-01-01T00:10:00.000Z",
              },
            ],
          },
          alerts: [
            {
              id: "alert-1",
              environment: "test",
              dedupeKey: "request:restart-1",
              restartRequestId: "restart-1",
              workerService: "mock-runtime-worker",
              sourceCategory: "restart_timeout",
              reasonCode: "restart_timeout",
              severity: "warning",
              status: "open",
              summary: "restart timed out",
              recommendedAction: "inspect worker",
              conditionSignature: "signature-1",
              occurrenceCount: 1,
              firstSeenAt: "2026-01-01T00:00:00.000Z",
              lastSeenAt: "2026-01-01T00:00:00.000Z",
              lastEvaluatedAt: "2026-01-01T00:00:00.000Z",
              requestedVersionId: "version-1",
              notification: {
                externallyNotified: true,
                sinkName: "restart-alert-webhook",
                sinkType: "generic_webhook",
                latestDestinationName: "primary",
                latestDestinationType: "primary",
                latestFormatterProfile: "generic",
                eventType: "alert_opened",
                latestDeliveryStatus: "sent",
                attemptCount: 1,
                lastAttemptedAt: "2026-01-01T00:00:00.000Z",
                resolutionNotificationSent: true,
                resolutionNotificationAt: "2026-01-01T00:10:00.000Z",
                selectedDestinationCount: 1,
                selectedDestinationNames: ["primary"],
                destinations: [
                  {
                    name: "primary",
                    sinkType: "generic_webhook",
                    formatterProfile: "generic",
                    priority: 10,
                    selected: true,
                    latestDeliveryStatus: "sent",
                    attemptCount: 1,
                    lastAttemptedAt: "2026-01-01T00:00:00.000Z",
                    routeReason: "destination selected by routing policy",
                    dedupeKey: "notification-1",
                    payloadFingerprint: "payload-1",
                    recoveryNotificationSent: true,
                    recoveryNotificationAt: "2026-01-01T00:10:00.000Z",
                  },
                ],
              },
              createdAt: "2026-01-01T00:00:00.000Z",
              updatedAt: "2026-01-01T00:00:00.000Z",
            },
          ],
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        }
      )
    );

    const getRequest = new Request("http://localhost/api/control/restart-alerts", {
      method: "GET",
      headers: {
        cookie: buildSessionCookie("viewer"),
        "content-type": "application/json",
        "x-request-id": "request-read",
      },
    });

    const getResponse = await GET(getRequest as any, { params: Promise.resolve({ path: ["restart-alerts"] }) } as any);
    expect(forwardControlRequestMock).toHaveBeenCalledTimes(1);
    expect((forwardControlRequestMock.mock.calls[0] as [string])[0]).toBe("/control/restart-alerts");
    expect(getResponse.status).toBe(200);
    await expect(getResponse.json()).resolves.toMatchObject({
      success: true,
      summary: {
        latestNotificationStatus: "sent",
      },
      alerts: [
        {
          notification: {
            externallyNotified: true,
            latestDeliveryStatus: "sent",
            resolutionNotificationSent: true,
            selectedDestinationNames: ["primary"],
            destinations: [
              {
                name: "primary",
                latestDeliveryStatus: "sent",
                attemptCount: 1,
                selected: true,
              },
            ],
          },
        },
      ],
    });

    forwardControlRequestMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          success: true,
          accepted: true,
          message: "restart alert acknowledged",
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        }
      )
    );

    const postRequest = new Request("http://localhost/api/control/restart-alerts/alert-123/acknowledge", {
      method: "POST",
      headers: {
        cookie: buildSessionCookie("admin"),
        "content-type": "application/json",
        "x-request-id": "request-ack",
      },
      body: JSON.stringify({ note: "investigating" }),
    });

    const postResponse = await POST(postRequest as any, { params: Promise.resolve({ path: ["restart-alerts", "alert-123", "acknowledge"] }) } as any);
    expect(forwardControlRequestMock).toHaveBeenCalledTimes(2);
    expect((forwardControlRequestMock.mock.calls[1] as [string])[0]).toBe("/control/restart-alerts/alert-123/acknowledge");
    expect(postResponse.status).toBe(200);
  });

  it("forwards delivery reporting reads through the server-side proxy without exposing secrets", async () => {
    forwardControlRequestMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          success: true,
          windowStartAt: "2026-03-27T00:00:00.000Z",
          windowEndAt: "2026-03-28T00:00:00.000Z",
          limit: 50,
          offset: 0,
          totalCount: 1,
          hasMore: false,
          deliveries: [
            {
              eventId: "event-1",
              alertId: "alert-1",
              environment: "production",
              destinationName: "primary",
              destinationType: "primary",
              sinkType: "generic_webhook",
              formatterProfile: "generic",
              eventType: "alert_opened",
              deliveryStatus: "sent",
              severity: "critical",
              alertStatus: "open",
              routeReason: "routing policy",
              attemptedAt: "2026-03-27T11:00:00.000Z",
              attemptCount: 1,
            },
          ],
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        }
      )
    );

    const journalRequest = new Request("http://localhost/api/control/restart-alert-deliveries", {
      method: "GET",
      headers: {
        cookie: buildSessionCookie("viewer"),
        "content-type": "application/json",
        "x-request-id": "request-delivery",
      },
    });

    const journalResponse = await GET(journalRequest as any, {
      params: Promise.resolve({ path: ["restart-alert-deliveries"] }) as any,
    } as any);

    expect(forwardControlRequestMock).toHaveBeenCalledTimes(1);
    expect((forwardControlRequestMock.mock.calls[0] as [string])[0]).toBe("/control/restart-alert-deliveries");
    expect(journalResponse.status).toBe(200);
    await expect(journalResponse.json()).resolves.toMatchObject({
      success: true,
      deliveries: [
        {
          destinationName: "primary",
          deliveryStatus: "sent",
        },
      ],
    });

    forwardControlRequestMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          success: true,
          windowStartAt: "2026-03-27T00:00:00.000Z",
          windowEndAt: "2026-03-28T00:00:00.000Z",
          totalCount: 1,
          destinations: [
            {
              destinationName: "primary",
              destinationType: "primary",
              sinkType: "generic_webhook",
              formatterProfile: "generic",
              totalCount: 1,
              sentCount: 1,
              failedCount: 0,
              suppressedCount: 0,
              skippedCount: 0,
              openAlertCount: 1,
              recentEnvironments: ["production"],
              recentEventTypes: ["alert_opened"],
              lastActivityAt: "2026-03-27T11:00:00.000Z",
              lastSentAt: "2026-03-27T11:00:00.000Z",
              healthHint: "healthy",
            },
          ],
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        }
      )
    );

    const summaryRequest = new Request("http://localhost/api/control/restart-alert-deliveries/summary", {
      method: "GET",
      headers: {
        cookie: buildSessionCookie("viewer"),
        "content-type": "application/json",
        "x-request-id": "request-delivery-summary",
      },
    });

    const summaryResponse = await GET(summaryRequest as any, {
      params: Promise.resolve({ path: ["restart-alert-deliveries", "summary"] }) as any,
    } as any);

    expect(forwardControlRequestMock).toHaveBeenCalledTimes(2);
    expect((forwardControlRequestMock.mock.calls[1] as [string])[0]).toBe("/control/restart-alert-deliveries/summary");
    expect(summaryResponse.status).toBe(200);
    await expect(summaryResponse.json()).resolves.toMatchObject({
      success: true,
      destinations: [
        {
          destinationName: "primary",
          healthHint: "healthy",
        },
      ],
    });
  });
});
