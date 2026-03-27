import { beforeEach, describe, expect, it, vi } from "vitest";

const { forwardControlRequestMock } = vi.hoisted(() => ({
  forwardControlRequestMock: vi.fn(),
}));

vi.mock("../../../dashboard/src/lib/control-client.ts", () => ({
  forwardControlRequest: forwardControlRequestMock,
}));

import { GET, POST } from "../../../dashboard/src/app/api/control/[...path]/route.ts";

describe("dashboard control proxy", () => {
  beforeEach(() => {
    forwardControlRequestMock.mockReset();
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

    const request = {
      method: "POST",
      headers: new Headers({
        "content-type": "application/json",
        "x-idempotency-key": "restart-123",
        "x-request-id": "request-abc",
      }),
      text: async () => JSON.stringify({ reason: "paper promotion" }),
    } as any;

    const response = await POST(request, { params: Promise.resolve({ path: ["restart-worker"] }) } as any);

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
          },
          alerts: [],
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        }
      )
    );

    const getRequest = {
      method: "GET",
      headers: new Headers({
        "content-type": "application/json",
        "x-request-id": "request-read",
      }),
      text: async () => "",
    } as any;

    const getResponse = await GET(getRequest, { params: Promise.resolve({ path: ["restart-alerts"] }) } as any);
    expect(forwardControlRequestMock).toHaveBeenCalledTimes(1);
    expect((forwardControlRequestMock.mock.calls[0] as [string])[0]).toBe("/control/restart-alerts");
    expect(getResponse.status).toBe(200);

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

    const postRequest = {
      method: "POST",
      headers: new Headers({
        "content-type": "application/json",
        "x-request-id": "request-ack",
      }),
      text: async () => JSON.stringify({ note: "investigating" }),
    } as any;

    const postResponse = await POST(postRequest, { params: Promise.resolve({ path: ["restart-alerts", "alert-123", "acknowledge"] }) } as any);
    expect(forwardControlRequestMock).toHaveBeenCalledTimes(2);
    expect((forwardControlRequestMock.mock.calls[1] as [string])[0]).toBe("/control/restart-alerts/alert-123/acknowledge");
    expect(postResponse.status).toBe(200);
  });
});
