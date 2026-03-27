import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createRenderDeployHookRestartOrchestrator,
} from "../../src/control/restart-orchestrator.js";

describe("render deploy hook restart orchestrator", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("posts restart requests to the deploy hook with operator metadata", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) =>
      new Response("", {
        status: 202,
        statusText: "Accepted",
        headers: {
          "x-render-request-id": "render-request-123",
        },
      })
    );
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const orchestrator = createRenderDeployHookRestartOrchestrator({
      deployHookUrl: "https://hooks.render.com/deploy/runtime-worker",
      targetService: "bobbyexecute-runtime-staging",
      targetWorker: "bobbyexecute-runtime-staging",
      enabled: true,
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    const result = await orchestrator.requestRestart({
      requestId: "restart-request-1",
      environment: "staging",
      actor: "operator@example.com",
      reason: "promote paper config",
      targetVersionId: "version-42",
      targetService: "bobbyexecute-runtime-staging",
      targetWorker: "bobbyexecute-runtime-staging",
      idempotencyKey: "restart-1",
    });

    expect(orchestrator.configured).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      accepted: true,
      method: "deploy_hook",
      targetService: "bobbyexecute-runtime-staging",
      providerStatusCode: 202,
      providerRequestId: "render-request-123",
    });

    const [input, init] = fetchMock.mock.calls[0];
    expect(String(input)).toBe("https://hooks.render.com/deploy/runtime-worker");
    expect(init?.method).toBe("POST");
    expect(new Headers(init?.headers).get("x-request-id")).toBe("restart-request-1");
    expect(new Headers(init?.headers).get("x-idempotency-key")).toBe("restart-1");
    expect(JSON.parse(String(init?.body))).toMatchObject({
      requestId: "restart-request-1",
      environment: "staging",
      actor: "operator@example.com",
      reason: "promote paper config",
      targetVersionId: "version-42",
      targetService: "bobbyexecute-runtime-staging",
      targetWorker: "bobbyexecute-runtime-staging",
    });
  });

  it("fails closed when the deploy hook is not configured", async () => {
    const orchestrator = createRenderDeployHookRestartOrchestrator({
      targetService: "bobbyexecute-runtime-staging",
      enabled: true,
    });

    const result = await orchestrator.requestRestart({
      requestId: "restart-request-2",
      environment: "staging",
      actor: "operator@example.com",
      targetService: "bobbyexecute-runtime-staging",
    });

    expect(orchestrator.configured).toBe(false);
    expect(result).toMatchObject({
      accepted: false,
      method: "deploy_hook",
      targetService: "bobbyexecute-runtime-staging",
      providerMessage: "worker restart orchestration is not configured",
    });
  });

  it("reports provider failure as a rejected orchestration", async () => {
    const fetchMock = vi.fn(async () =>
      new Response("provider failed", {
        status: 500,
        statusText: "Internal Server Error",
      })
    );
    const orchestrator = createRenderDeployHookRestartOrchestrator({
      deployHookUrl: "https://hooks.render.com/deploy/runtime-worker",
      targetService: "bobbyexecute-runtime-staging",
      enabled: true,
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    const result = await orchestrator.requestRestart({
      requestId: "restart-request-3",
      environment: "staging",
      actor: "operator@example.com",
      targetService: "bobbyexecute-runtime-staging",
    });

    expect(result).toMatchObject({
      accepted: false,
      method: "deploy_hook",
      targetService: "bobbyexecute-runtime-staging",
      providerStatusCode: 500,
      providerMessage: "Internal Server Error",
    });
  });
});
