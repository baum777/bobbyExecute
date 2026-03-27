import { randomUUID } from "node:crypto";
import type { WorkerRestartMethod } from "../persistence/worker-restart-repository.js";

export interface WorkerRestartOrchestrationRequest {
  requestId: string;
  environment: string;
  actor: string;
  reason?: string;
  targetVersionId?: string;
  targetService: string;
  targetWorker?: string;
  idempotencyKey?: string;
}

export interface WorkerRestartOrchestrationResult {
  accepted: boolean;
  method: WorkerRestartMethod;
  targetService: string;
  providerStatusCode?: number;
  providerRequestId?: string;
  providerMessage?: string;
}

export interface WorkerRestartOrchestrator {
  readonly configured: boolean;
  readonly method: WorkerRestartMethod;
  readonly targetService?: string;
  describe(): {
    configured: boolean;
    method: WorkerRestartMethod;
    targetService?: string;
    targetWorker?: string;
  };
  requestRestart(input: WorkerRestartOrchestrationRequest): Promise<WorkerRestartOrchestrationResult>;
}

export interface RenderDeployHookOrchestratorOptions {
  deployHookUrl?: string;
  targetService?: string;
  targetWorker?: string;
  enabled?: boolean;
  fetchImpl?: typeof fetch;
}

function trimOrUndefined(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

export class RenderDeployHookRestartOrchestrator implements WorkerRestartOrchestrator {
  readonly method = "deploy_hook" as const;
  readonly configured: boolean;
  readonly targetService?: string;

  constructor(private readonly options: RenderDeployHookOrchestratorOptions = {}) {
    this.targetService = trimOrUndefined(options.targetService);
    this.configured = Boolean(
      options.enabled !== false &&
        trimOrUndefined(options.deployHookUrl) &&
        this.targetService
    );
  }

  describe(): { configured: boolean; method: WorkerRestartMethod; targetService?: string; targetWorker?: string } {
    return {
      configured: this.configured,
      method: this.method,
      targetService: this.targetService,
      targetWorker: trimOrUndefined(this.options.targetWorker),
    };
  }

  async requestRestart(input: WorkerRestartOrchestrationRequest): Promise<WorkerRestartOrchestrationResult> {
    const deployHookUrl = trimOrUndefined(this.options.deployHookUrl);
    if (!this.configured || !deployHookUrl || !this.targetService) {
      return {
        accepted: false,
        method: this.method,
        targetService: input.targetService,
        providerMessage: "worker restart orchestration is not configured",
      };
    }

    const requestId = input.requestId || randomUUID();
    const response = await (this.options.fetchImpl ?? fetch)(deployHookUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-request-id": requestId,
        ...(input.idempotencyKey ? { "x-idempotency-key": input.idempotencyKey } : {}),
      },
      body: JSON.stringify({
        requestId,
        environment: input.environment,
        actor: input.actor,
        reason: input.reason,
        targetVersionId: input.targetVersionId,
        targetService: input.targetService,
        targetWorker: input.targetWorker,
      }),
    });

    const providerRequestId = response.headers.get("x-request-id") ?? response.headers.get("x-render-request-id") ?? undefined;
    return {
      accepted: response.ok,
      method: this.method,
      targetService: input.targetService,
      providerStatusCode: response.status,
      providerRequestId,
      providerMessage: response.statusText || undefined,
    };
  }
}

export function createRenderDeployHookRestartOrchestrator(
  options: RenderDeployHookOrchestratorOptions = {}
): WorkerRestartOrchestrator {
  return new RenderDeployHookRestartOrchestrator(options);
}
