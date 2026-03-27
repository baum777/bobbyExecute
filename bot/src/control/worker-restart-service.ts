import { randomUUID } from "node:crypto";
import type { Config } from "../config/config-schema.js";
import type { RuntimeSnapshot } from "../runtime/dry-run-runtime.js";
import type { RuntimeConfigControlView, RuntimeConfigStatus } from "../config/runtime-config-schema.js";
import type { RuntimeConfigManager } from "../runtime/runtime-config-manager.js";
import type {
  RuntimeVisibilityRepository,
  RuntimeWorkerVisibility,
} from "../persistence/runtime-visibility-repository.js";
import type {
  WorkerRestartAlertActionResponse,
  WorkerRestartAlertListResponse,
  WorkerRestartAlertService,
  WorkerRestartAlertSummary,
} from "./worker-restart-alert-service.js";
import type {
  WorkerRestartMethod,
  WorkerRestartRequestRecord,
  WorkerRestartRepository,
  WorkerRestartRecordStatus,
} from "../persistence/worker-restart-repository.js";
import {
  createRenderDeployHookRestartOrchestrator,
  type RenderDeployHookOrchestratorOptions,
  type WorkerRestartOrchestrator,
  type WorkerRestartOrchestrationRequest,
  type WorkerRestartOrchestrationResult,
} from "./restart-orchestrator.js";
import { loadVisibleRuntimeState } from "../server/runtime-visibility.js";

export interface WorkerRestartSnapshot {
  runtime?: RuntimeSnapshot;
  runtimeConfig: RuntimeConfigStatus;
  controlView: RuntimeConfigControlView;
  worker?: RuntimeWorkerVisibility;
  restart: WorkerRestartStatus;
  restartAlerts: WorkerRestartAlertSummary;
  request?: WorkerRestartRequestRecord | null;
}

export interface WorkerRestartStatus {
  required: boolean;
  requested: boolean;
  inProgress: boolean;
  pendingVersionId?: string;
  restartRequiredReason?: string;
  requestId?: string;
  requestedAt?: string;
  requestedBy?: string;
  lastOutcome?: WorkerRestartRecordStatus;
  lastOutcomeAt?: string;
  lastOutcomeReason?: string;
  method?: WorkerRestartMethod;
  targetService?: string;
  targetWorker?: string;
  convergenceObservedAt?: string;
  clearedAt?: string;
  lastHeartbeatAt?: string;
  lastAppliedVersionId?: string;
  deadlineAt?: string;
}

export interface WorkerRestartActionResponse extends WorkerRestartSnapshot {
  accepted: boolean;
  message: string;
  reason?: string;
  targetService: string;
  targetVersionId?: string;
  orchestrationMethod: WorkerRestartMethod;
  statusCode: number;
}

export interface WorkerRestartServiceOptions {
  runtimeConfigManager: RuntimeConfigManager;
  runtimeVisibilityRepository: RuntimeVisibilityRepository;
  restartRepository: WorkerRestartRepository;
  alertService?: WorkerRestartAlertService;
  environment: string;
  workerServiceName: string;
  orchestrator: WorkerRestartOrchestrator;
  cooldownMs?: number;
  convergenceTimeoutMs?: number;
  getRuntimeSnapshot?: () => RuntimeSnapshot | undefined;
  logger?: Pick<Console, "info" | "warn" | "error">;
}

export interface WorkerRestartServiceConfig {
  env?: NodeJS.ProcessEnv;
  restartRebootsEnabled?: boolean;
  deployHookUrl?: string;
  workerServiceName?: string;
  targetWorker?: string;
  cooldownMs?: number;
  convergenceTimeoutMs?: number;
}

export interface WorkerRestartRequestInput {
  actor: string;
  reason?: string;
  idempotencyKey?: string;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function trimOrUndefined(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

function parseBoolean(value: string | undefined, fallback = false): boolean {
  const trimmed = value?.trim().toLowerCase();
  if (!trimmed) {
    return fallback;
  }
  return trimmed === "true" || trimmed === "1" || trimmed === "yes";
}

function parseInteger(value: string | undefined, fallback: number, minimum = 0): number {
  const trimmed = value?.trim();
  if (!trimmed) {
    return fallback;
  }
  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(parsed) || parsed < minimum) {
    return fallback;
  }
  return parsed;
}

function nowIso(): string {
  return new Date().toISOString();
}

function addMs(iso: string, ms: number): string {
  return new Date(Date.parse(iso) + ms).toISOString();
}

function isPendingStatus(status: WorkerRestartRequestRecord["status"]): boolean {
  return status === "requested" || status === "dispatched";
}

function buildFallbackRestartStatus(
  runtimeConfig: RuntimeConfigStatus,
  worker?: RuntimeWorkerVisibility,
  request?: WorkerRestartRequestRecord | null
): WorkerRestartStatus {
  const latestOutcome = request?.status;
  const requested = latestOutcome === "requested" || latestOutcome === "dispatched";
  return {
    required: runtimeConfig.requiresRestart,
    requested,
    inProgress: requested,
    pendingVersionId: request?.targetVersionId ?? (runtimeConfig.requiresRestart ? runtimeConfig.requestedVersionId : undefined),
    restartRequiredReason: request?.restartRequiredReason ?? runtimeConfig.pendingReason,
    requestId: request?.id,
    requestedAt: request?.requestedAt,
    requestedBy: request?.actor,
    lastOutcome: latestOutcome,
    lastOutcomeAt: request?.updatedAt,
    lastOutcomeReason: request?.failureReason ?? request?.rejectionReason ?? request?.providerMessage,
    method: request?.method,
    targetService: request?.targetService,
    targetWorker: request?.targetWorker,
    convergenceObservedAt: request?.convergenceObservedAt,
    clearedAt: request?.clearedAt,
    lastHeartbeatAt: worker?.lastHeartbeatAt,
    lastAppliedVersionId: worker?.lastAppliedVersionId,
    deadlineAt: request?.deadlineAt,
  };
}

function buildFallbackRestartAlertSummary(
  runtimeConfig: RuntimeConfigStatus,
  request?: WorkerRestartRequestRecord | null
): WorkerRestartAlertSummary {
  return {
    environment: runtimeConfig.environment,
    workerService: request?.targetService ?? runtimeConfig.environment,
    latestRestartRequestStatus: request?.status,
    lastSuccessfulRestartConvergenceAt: request?.convergenceObservedAt,
    openAlertCount: 0,
    acknowledgedAlertCount: 0,
    resolvedAlertCount: 0,
    activeAlertCount: 0,
    stalledRestartCount: 0,
    highestOpenSeverity: undefined,
    divergenceAlerting: false,
    openSourceCategories: [],
    lastEvaluatedAt: nowIso(),
  };
}

export class WorkerRestartService {
  constructor(private readonly deps: WorkerRestartServiceOptions) {}

  get configured(): boolean {
    return this.deps.orchestrator.configured;
  }

  get method(): WorkerRestartMethod {
    return this.deps.orchestrator.method;
  }

  get targetService(): string {
    return this.deps.workerServiceName;
  }

  private async loadSnapshot(): Promise<WorkerRestartSnapshot> {
    const runtimeConfig = this.deps.runtimeConfigManager.getRuntimeConfigStatus();
    const controlView = this.deps.runtimeConfigManager.getRuntimeControlView();
    const visible = await loadVisibleRuntimeState(
      this.deps.runtimeVisibilityRepository,
      this.deps.environment,
      this.deps.getRuntimeSnapshot
    );
    const latest = await this.deps.restartRepository.loadLatest(this.deps.environment);
    const reconciled = await this.reconcileLatestRequest(latest, runtimeConfig, visible.worker);
    const restart = buildFallbackRestartStatus(runtimeConfig, visible.worker, reconciled);
    const snapshot: WorkerRestartSnapshot = {
      runtime: visible.runtime,
      runtimeConfig,
      controlView,
      worker: visible.worker,
      restart,
      restartAlerts: buildFallbackRestartAlertSummary(runtimeConfig, reconciled),
      request: reconciled,
    };
    if (this.deps.alertService) {
      try {
        snapshot.restartAlerts = await this.deps.alertService.sync(snapshot);
      } catch (error) {
        this.deps.logger?.warn?.("[restart] restart alert sync failed; returning fallback summary", error);
      }
    }
    return snapshot;
  }

  private async reconcileLatestRequest(
    latest: WorkerRestartRequestRecord | null,
    runtimeConfig: RuntimeConfigStatus,
    worker?: RuntimeWorkerVisibility
  ): Promise<WorkerRestartRequestRecord | null> {
    if (!latest) {
      return null;
    }

    const current = clone(latest);
    if (current.status !== "requested" && current.status !== "dispatched") {
      return current;
    }

    const targetVersionId = current.targetVersionId ?? runtimeConfig.requestedVersionId;
    const workerAppliedVersionId = worker?.lastAppliedVersionId;
    const workerHeartbeatAt = worker?.lastHeartbeatAt ? Date.parse(worker.lastHeartbeatAt) : undefined;
    const requestedAt = Date.parse(current.requestedAt);
    const now = Date.now();
    const deadlineAt = current.deadlineAt ? Date.parse(current.deadlineAt) : requestedAt + this.getConvergenceTimeoutMs();

    const converged =
      runtimeConfig.requiresRestart === false &&
      runtimeConfig.appliedVersionId != null &&
      runtimeConfig.requestedVersionId != null &&
      runtimeConfig.appliedVersionId === runtimeConfig.requestedVersionId &&
      workerAppliedVersionId === targetVersionId &&
      workerHeartbeatAt != null &&
      workerHeartbeatAt >= requestedAt;

    if (converged) {
      const updated: WorkerRestartRequestRecord = {
        ...current,
        status: "converged",
        accepted: true,
        updatedAt: nowIso(),
        convergenceObservedAt: nowIso(),
        clearedAt: nowIso(),
      };
      await this.deps.restartRepository.save(updated);
      return updated;
    }

    if (now >= deadlineAt) {
      const updated: WorkerRestartRequestRecord = {
        ...current,
        status: "failed",
        accepted: false,
        updatedAt: nowIso(),
        failureReason: current.failureReason ?? "worker restart did not converge before the deadline",
      };
      await this.deps.restartRepository.save(updated);
      return updated;
    }

    return current;
  }

  private getCooldownMs(): number {
    return this.deps.cooldownMs ?? 5 * 60 * 1000;
  }

  private getConvergenceTimeoutMs(): number {
    return this.deps.convergenceTimeoutMs ?? 10 * 60 * 1000;
  }

  async readSnapshot(): Promise<WorkerRestartSnapshot> {
    return this.loadSnapshot();
  }

  async readRestartAlerts(): Promise<WorkerRestartAlertListResponse> {
    const snapshot = await this.loadSnapshot();
    if (!this.deps.alertService) {
      return {
        summary: buildFallbackRestartAlertSummary(snapshot.runtimeConfig, snapshot.request),
        alerts: [],
      };
    }

    return this.deps.alertService.list(snapshot);
  }

  async acknowledgeRestartAlert(
    alertId: string,
    input: { actor: string; note?: string }
  ): Promise<WorkerRestartAlertActionResponse> {
    const snapshot = await this.loadSnapshot();
    if (!this.deps.alertService) {
      return {
        accepted: false,
        statusCode: 503,
        message: "restart alerting is not configured",
        reason: "restart alerting unavailable",
        summary: buildFallbackRestartAlertSummary(snapshot.runtimeConfig, snapshot.request),
      };
    }

    return this.deps.alertService.acknowledge(snapshot, alertId, input);
  }

  async resolveRestartAlert(
    alertId: string,
    input: { actor: string; note?: string }
  ): Promise<WorkerRestartAlertActionResponse> {
    const snapshot = await this.loadSnapshot();
    if (!this.deps.alertService) {
      return {
        accepted: false,
        statusCode: 503,
        message: "restart alerting is not configured",
        reason: "restart alerting unavailable",
        summary: buildFallbackRestartAlertSummary(snapshot.runtimeConfig, snapshot.request),
      };
    }

    return this.deps.alertService.resolve(snapshot, alertId, input);
  }

  async requestRestart(input: WorkerRestartRequestInput): Promise<WorkerRestartActionResponse> {
    const snapshot = await this.loadSnapshot();
    const requestKey = trimOrUndefined(input.idempotencyKey);
    if (requestKey) {
      const existing = await this.deps.restartRepository.loadByRequestKey(this.deps.environment, requestKey);
      if (existing) {
        return this.buildActionResponse(existing, await this.loadSnapshot(), existing.accepted ? 202 : 409);
      }
    }

    const reason = trimOrUndefined(input.reason) ?? snapshot.restart.restartRequiredReason ?? "worker restart requested";
    const targetVersionId = snapshot.runtimeConfig.requestedVersionId ?? snapshot.runtimeConfig.appliedVersionId;
    const requestedAt = nowIso();
    const targetService = this.targetService;
    const targetWorker = this.deps.orchestrator.describe().targetWorker;
    const restartRequired = snapshot.restart.required;
    const latest = await this.deps.restartRepository.loadLatest(this.deps.environment);

    if (latest && isPendingStatus(latest.status) && (!requestKey || latest.requestKey !== requestKey)) {
      const record: WorkerRestartRequestRecord = {
        id: randomUUID(),
        environment: this.deps.environment,
        requestKey,
        actor: input.actor,
        reason,
        targetVersionId,
        targetService,
        targetWorker,
        method: this.method,
        status: "rejected",
        accepted: false,
        restartRequired,
        restartRequiredReason: snapshot.restart.restartRequiredReason,
        requestedAt,
        updatedAt: requestedAt,
        rejectionReason: "worker restart is already in progress",
      };
      await this.deps.restartRepository.save(record);
      return this.buildActionResponse(record, await this.loadSnapshot(), 409, record.rejectionReason);
    }

    if (!restartRequired && !snapshot.restart.requested) {
      const record: WorkerRestartRequestRecord = {
        id: randomUUID(),
        environment: this.deps.environment,
        requestKey,
        actor: input.actor,
        reason,
        targetVersionId,
        targetService,
        targetWorker,
        method: this.method,
        status: "rejected",
        accepted: false,
        restartRequired,
        restartRequiredReason: snapshot.restart.restartRequiredReason,
        requestedAt,
        updatedAt: requestedAt,
        rejectionReason: "restart is not required for the current runtime state",
      };
      await this.deps.restartRepository.save(record);
      return this.buildActionResponse(record, await this.loadSnapshot(), 409, "restart is not required");
    }

    const cooldownUntil = latest && !isPendingStatus(latest.status)
      ? addMs(latest.requestedAt, this.getCooldownMs())
      : undefined;

    if (cooldownUntil && Date.now() < Date.parse(cooldownUntil)) {
      const record: WorkerRestartRequestRecord = {
        id: randomUUID(),
        environment: this.deps.environment,
        requestKey,
        actor: input.actor,
        reason,
        targetVersionId,
        targetService,
        targetWorker,
        method: this.method,
        status: "cooldown",
        accepted: false,
        restartRequired,
        restartRequiredReason: snapshot.restart.restartRequiredReason,
        requestedAt,
        updatedAt: requestedAt,
        deadlineAt: addMs(requestedAt, this.getConvergenceTimeoutMs()),
        rejectionReason: `restart request rate-limited until ${cooldownUntil}`,
      };
      await this.deps.restartRepository.save(record);
      return this.buildActionResponse(record, await this.loadSnapshot(), 429, record.rejectionReason);
    }

    if (!this.deps.orchestrator.configured) {
      const record: WorkerRestartRequestRecord = {
        id: randomUUID(),
        environment: this.deps.environment,
        requestKey,
        actor: input.actor,
        reason,
        targetVersionId,
        targetService,
        targetWorker,
        method: this.method,
        status: "unconfigured",
        accepted: false,
        restartRequired,
        restartRequiredReason: snapshot.restart.restartRequiredReason,
        requestedAt,
        updatedAt: requestedAt,
        deadlineAt: addMs(requestedAt, this.getConvergenceTimeoutMs()),
        rejectionReason: "worker restart orchestration is not configured",
      };
      await this.deps.restartRepository.save(record);
      return this.buildActionResponse(record, await this.loadSnapshot(), 503, record.rejectionReason);
    }

    const requestedRecord: WorkerRestartRequestRecord = {
      id: randomUUID(),
      environment: this.deps.environment,
      requestKey,
      actor: input.actor,
      reason,
      targetVersionId,
      targetService,
      targetWorker,
      method: this.method,
      status: "requested",
      accepted: true,
      restartRequired,
      restartRequiredReason: snapshot.restart.restartRequiredReason,
      requestedAt,
      updatedAt: requestedAt,
      deadlineAt: addMs(requestedAt, this.getConvergenceTimeoutMs()),
    };
    await this.deps.restartRepository.save(requestedRecord);

    const orchestrationInput: WorkerRestartOrchestrationRequest = {
      requestId: requestedRecord.id,
      environment: this.deps.environment,
      actor: input.actor,
      reason,
      targetVersionId,
      targetService,
      targetWorker,
      idempotencyKey: requestKey,
    };

    try {
      const orchestration: WorkerRestartOrchestrationResult = await this.deps.orchestrator.requestRestart(orchestrationInput);
      if (!orchestration.accepted) {
        const failed: WorkerRestartRequestRecord = {
          ...requestedRecord,
          status: "failed",
          accepted: false,
          updatedAt: nowIso(),
          providerStatusCode: orchestration.providerStatusCode,
          providerRequestId: orchestration.providerRequestId,
          providerMessage: orchestration.providerMessage,
          failureReason: orchestration.providerMessage ?? "worker restart orchestration rejected the request",
        };
        await this.deps.restartRepository.save(failed);
        return this.buildActionResponse(failed, await this.loadSnapshot(), 502, failed.failureReason);
      }

      const dispatched: WorkerRestartRequestRecord = {
        ...requestedRecord,
        status: "dispatched",
        updatedAt: nowIso(),
        providerStatusCode: orchestration.providerStatusCode,
        providerRequestId: orchestration.providerRequestId,
        providerMessage: orchestration.providerMessage,
      };
      await this.deps.restartRepository.save(dispatched);
      return this.buildActionResponse(dispatched, await this.loadSnapshot(), 202, "worker restart dispatched");
    } catch (error) {
      const failed: WorkerRestartRequestRecord = {
        ...requestedRecord,
        status: "failed",
        accepted: false,
        updatedAt: nowIso(),
        failureReason: error instanceof Error ? error.message : String(error),
      };
      await this.deps.restartRepository.save(failed);
      return this.buildActionResponse(failed, await this.loadSnapshot(), 502, failed.failureReason);
    }
  }

  private buildActionResponse(
    request: WorkerRestartRequestRecord,
    snapshot: WorkerRestartSnapshot,
    statusCode: number,
    message?: string
  ): WorkerRestartActionResponse {
    return {
      ...snapshot,
      accepted: request.accepted,
      message:
        message ??
        (request.accepted ? "worker restart request accepted" : request.rejectionReason ?? request.failureReason ?? "worker restart request rejected"),
      reason: request.reason,
      targetService: request.targetService,
      targetVersionId: request.targetVersionId,
      orchestrationMethod: request.method,
      statusCode,
    };
  }
}

export function createWorkerRestartService(
  config: Config,
  options: Omit<WorkerRestartServiceOptions, "orchestrator" | "workerServiceName"> &
    Partial<Pick<WorkerRestartServiceOptions, "workerServiceName">> &
    RenderDeployHookOrchestratorOptions & {
      env?: NodeJS.ProcessEnv;
      enabled?: boolean;
    }
): WorkerRestartService {
  const env = options.env ?? process.env;
  const enabled =
    options.enabled ??
    parseBoolean(env.CONTROL_RESTARTS_ENABLED, false);
  const deployHookUrl = trimOrUndefined(options.deployHookUrl ?? env.WORKER_DEPLOY_HOOK_URL);
  const workerServiceName =
    trimOrUndefined(options.workerServiceName ?? options.targetService ?? env.WORKER_SERVICE_NAME);
  const orchestrator = createRenderDeployHookRestartOrchestrator({
    deployHookUrl,
    targetService: workerServiceName,
    targetWorker: options.targetWorker,
    enabled,
  });

  return new WorkerRestartService({
    runtimeConfigManager: options.runtimeConfigManager,
    runtimeVisibilityRepository: options.runtimeVisibilityRepository,
    restartRepository: options.restartRepository,
    alertService: options.alertService,
    environment: options.environment ?? env.RUNTIME_CONFIG_ENV?.trim() ?? env.RENDER_SERVICE_NAME?.trim() ?? config.nodeEnv,
    workerServiceName: workerServiceName ?? "",
    orchestrator,
    cooldownMs: options.cooldownMs ?? parseInteger(env.CONTROL_RESTART_COOLDOWN_MS, 5 * 60 * 1000, 0),
    convergenceTimeoutMs:
      options.convergenceTimeoutMs ?? parseInteger(env.CONTROL_RESTART_CONVERGENCE_TIMEOUT_MS, 10 * 60 * 1000, 1000),
    getRuntimeSnapshot: options.getRuntimeSnapshot,
    logger: options.logger,
  });
}
