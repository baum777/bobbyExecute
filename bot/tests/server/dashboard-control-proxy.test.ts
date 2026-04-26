import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkerRestartDeliveryTrendRow } from "../../../dashboard/src/types/api.ts";
import { buildDashboardSessionCookie } from "../../../dashboard/src/lib/operator-auth.ts";
import { parseControlOperatorAssertion } from "../../src/control/control-governance.js";
import type { DashboardOperatorSession } from "../../../dashboard/src/types/api.ts";

const CONTROL_SECRET = "dashboard-control-secret";
const CONTROL_SERVICE_URL = "https://control.internal";
const BOT_API_URL = "https://bot.example";
const DASHBOARD_SESSION_SECRET = "dashboard-session-secret";

function resetEnv(): void {
  delete process.env.CONTROL_SERVICE_URL;
  delete process.env.CONTROL_TOKEN;
  delete process.env.NEXT_PUBLIC_API_URL;
  delete process.env.NEXT_PUBLIC_USE_MOCK;
  delete process.env.DASHBOARD_SESSION_SECRET;
}

describe("dashboard control proxy", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.CONTROL_SERVICE_URL = CONTROL_SERVICE_URL;
    process.env.CONTROL_TOKEN = CONTROL_SECRET;
    process.env.NEXT_PUBLIC_API_URL = BOT_API_URL;
    process.env.NEXT_PUBLIC_USE_MOCK = "false";
    process.env.DASHBOARD_SESSION_SECRET = DASHBOARD_SESSION_SECRET;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetEnv();
  });

  it("keeps browser-facing mutations on the dashboard proxy without exposing the control secret", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ success: true, message: "ok" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const { api } = await import("../../../dashboard/src/lib/api.ts");

    await api.emergencyStop();
    await api.reset();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0][0])).toBe("/api/control/emergency-stop");
    expect(String(fetchMock.mock.calls[1][0])).toBe("/api/control/reset");
    const firstHeaders = new Headers(fetchMock.mock.calls[0][1] as RequestInit | undefined);
    const secondHeaders = new Headers(fetchMock.mock.calls[1][1] as RequestInit | undefined);
    expect(firstHeaders.get("authorization")).toBeNull();
    expect(secondHeaders.get("authorization")).toBeNull();
    expect(JSON.stringify(fetchMock.mock.calls)).not.toContain(CONTROL_SECRET);
  });

  it("keeps browser-facing delivery reporting reads on the dashboard proxy without exposing the control secret", async () => {
    const fetchMock = vi.fn(async () =>
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
              deliveryStatus: "sent",
              attemptedAt: "2026-03-27T11:00:00.000Z",
            },
          ],
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        }
      )
    );
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const { api } = await import("../../../dashboard/src/lib/api.ts");
    const { buildDeliveryJournalUrlState, buildTrendDrilldown, parseDeliveryJournalUrlState } = await import(
      "../../../dashboard/src/lib/delivery-drilldown.ts"
    );

    const trendRow: WorkerRestartDeliveryTrendRow = {
      destinationName: "primary",
      destinationType: "webhook",
      sinkType: "generic_webhook",
      formatterProfile: "generic",
      currentWindow: {
        windowStartAt: "2026-03-27T00:00:00.000Z",
        windowEndAt: "2026-03-28T00:00:00.000Z",
        totalCount: 3,
        sentCount: 1,
        failedCount: 2,
        suppressedCount: 0,
        skippedCount: 0,
        failureRate: 0.6666666667,
        suppressionRate: 0,
        healthHint: "failing",
        recentEnvironments: ["production"],
        recentEventTypes: ["alert_escalated"],
        lastActivityAt: "2026-03-27T12:00:00.000Z",
        lastSentAt: "2026-03-27T11:00:00.000Z",
        lastFailedAt: "2026-03-27T12:00:00.000Z",
        lastSuppressedAt: undefined,
        lastSkippedAt: undefined,
      },
      comparisonWindow: {
        windowStartAt: "2026-03-21T00:00:00.000Z",
        windowEndAt: "2026-03-28T00:00:00.000Z",
        totalCount: 12,
        sentCount: 8,
        failedCount: 4,
        suppressedCount: 0,
        skippedCount: 0,
        failureRate: 0.3333333333,
        suppressionRate: 0,
        healthHint: "degraded",
        recentEnvironments: ["production"],
        recentEventTypes: ["alert_opened", "alert_escalated"],
        lastActivityAt: "2026-03-27T12:00:00.000Z",
        lastSentAt: "2026-03-27T11:00:00.000Z",
        lastFailedAt: "2026-03-27T12:00:00.000Z",
        lastSuppressedAt: undefined,
        lastSkippedAt: undefined,
      },
      currentHealthHint: "failing",
      comparisonHealthHint: "degraded",
      trendHint: "worsening",
      recentFailureDelta: 1,
      recentSuppressionDelta: 0,
      recentVolumeDelta: 0,
      lastSentAt: "2026-03-27T11:00:00.000Z",
      lastFailedAt: "2026-03-27T12:00:00.000Z",
      summaryText: "Delivery behavior is worsening.",
    };

    const trendDraft = {
      environment: "production",
      destinationName: "",
      status: "failed",
      eventType: "alert_escalated",
      severity: "critical",
      from: "",
      to: "",
      alertId: "alert-123",
      restartRequestId: "restart-123",
      formatterProfile: "generic",
    };
    const drilldown = buildTrendDrilldown(trendDraft, trendRow, "24h");
    const sharedUrl = buildDeliveryJournalUrlState(drilldown).toString();
    const restoredFromUrl = parseDeliveryJournalUrlState(new URLSearchParams(sharedUrl));

    await api.restartAlertDeliveries({ environment: "production", destinationName: "primary" });
    await api.restartAlertDeliverySummary({ environment: "production", destinationName: "primary" });
    await api.restartAlertDeliveryTrends({ environment: "production", destinationName: "primary", limit: 25 });
    await api.restartAlertDeliveries(restoredFromUrl.query);

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(String(fetchMock.mock.calls[0][0])).toBe("/api/control/restart-alert-deliveries?environment=production&destinationName=primary");
    expect(String(fetchMock.mock.calls[1][0])).toBe("/api/control/restart-alert-deliveries/summary?environment=production&destinationName=primary");
    expect(String(fetchMock.mock.calls[2][0])).toBe("/api/control/restart-alert-deliveries/trends?environment=production&destinationName=primary&limit=25");
    expect(String(fetchMock.mock.calls[3][0])).toBe(
      "/api/control/restart-alert-deliveries?environment=production&destinationName=primary&status=failed&eventType=alert_escalated&severity=critical&from=2026-03-27T00%3A00%3A00.000Z&to=2026-03-28T00%3A00%3A00.000Z&alertId=alert-123&restartRequestId=restart-123&formatterProfile=generic"
    );
    expect(sharedUrl).toBe(
      "environment=production&destinationName=primary&status=failed&eventType=alert_escalated&severity=critical&from=2026-03-27T00%3A00%3A00.000Z&to=2026-03-28T00%3A00%3A00.000Z&alertId=alert-123&restartRequestId=restart-123&formatterProfile=generic&drilldown=trend&window=24h"
    );
    const firstHeaders = new Headers(fetchMock.mock.calls[0][1] as RequestInit | undefined);
    const secondHeaders = new Headers(fetchMock.mock.calls[1][1] as RequestInit | undefined);
    const thirdHeaders = new Headers(fetchMock.mock.calls[2][1] as RequestInit | undefined);
    const fourthHeaders = new Headers(fetchMock.mock.calls[3][1] as RequestInit | undefined);
    expect(firstHeaders.get("authorization")).toBeNull();
    expect(secondHeaders.get("authorization")).toBeNull();
    expect(thirdHeaders.get("authorization")).toBeNull();
    expect(fourthHeaders.get("authorization")).toBeNull();
    expect(JSON.stringify(fetchMock.mock.calls)).not.toContain(CONTROL_SECRET);
  });

  it("forwards server-side dashboard control requests with bearer auth to the private control service", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ success: true, accepted: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const { POST } = await import("../../../dashboard/src/app/api/control/[...path]/route.ts");
    const nowMs = Date.now();
    const session: DashboardOperatorSession = {
      sessionId: "session-123",
      actorId: "alice",
      displayName: "Alice Example",
      role: "admin",
      issuedAt: new Date(nowMs - 5 * 60 * 1000).toISOString(),
      expiresAt: new Date(nowMs + 60 * 60 * 1000).toISOString(),
    };
    const sessionCookie = buildDashboardSessionCookie(session, {
      DASHBOARD_SESSION_SECRET,
    });

    const request = new Request("http://localhost/api/control/mode", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-request-id": "req-123",
        "x-idempotency-key": "idem-456",
        cookie: `${sessionCookie.name}=${sessionCookie.value}`,
      },
      body: JSON.stringify({ mode: "paper", reason: "proxy test" }),
    });

    const response = await POST(request as unknown as import("next/server").NextRequest, {
      params: Promise.resolve({ path: ["mode"] }),
    });

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [input, init] = fetchMock.mock.calls[0];
    expect(String(input)).toBe(`${CONTROL_SERVICE_URL}/control/mode`);
    const headers = new Headers((init as RequestInit | undefined)?.headers);
    expect(headers.get("authorization")).toBe(`Bearer ${CONTROL_SECRET}`);
    expect(headers.get("content-type")).toBe("application/json");
    expect(headers.get("x-request-id")).toBe("req-123");
    expect(headers.get("x-idempotency-key")).toBe("idem-456");
    const assertion = parseControlOperatorAssertion(headers.get("x-dashboard-operator-assertion") ?? undefined, CONTROL_SECRET);
    expect(assertion).toMatchObject({
      actorId: "alice",
      displayName: "Alice Example",
      role: "admin",
      authResult: "authorized",
      action: "mode_change",
      target: "/control/mode",
      requestId: "req-123",
    });

    await expect(response.json()).resolves.toMatchObject({
      success: true,
      accepted: true,
    });
  });

  it("refuses dashboard control read proxy access without an active operator session", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const { GET } = await import("../../../dashboard/src/app/api/control/[...path]/route.ts");
    const response = await GET(new Request("http://localhost/api/control/status") as unknown as import("next/server").NextRequest, {
      params: Promise.resolve({ path: ["status"] }),
    });

    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      message: "Dashboard operator session is required for control proxy access.",
    });
  });

  it("forwards dashboard control reads only when an operator session is active", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ success: true, runtimeStatus: "running" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const { GET } = await import("../../../dashboard/src/app/api/control/[...path]/route.ts");
    const nowMs = Date.now();
    const session: DashboardOperatorSession = {
      sessionId: "session-read",
      actorId: "viewer",
      displayName: "Viewer Example",
      role: "viewer",
      issuedAt: new Date(nowMs - 5 * 60 * 1000).toISOString(),
      expiresAt: new Date(nowMs + 60 * 60 * 1000).toISOString(),
    };
    const sessionCookie = buildDashboardSessionCookie(session, {
      DASHBOARD_SESSION_SECRET,
    });

    const response = await GET(
      new Request("http://localhost/api/control/status", {
        headers: {
          cookie: `${sessionCookie.name}=${sessionCookie.value}`,
        },
      }) as unknown as import("next/server").NextRequest,
      {
        params: Promise.resolve({ path: ["status"] }),
      }
    );

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [input, init] = fetchMock.mock.calls[0];
    expect(String(input)).toBe(`${CONTROL_SERVICE_URL}/control/status`);
    const headers = new Headers((init as RequestInit | undefined)?.headers);
    expect(headers.get("authorization")).toBe(`Bearer ${CONTROL_SECRET}`);
    expect(headers.get("x-dashboard-operator-assertion")).toBeNull();
  });
});
