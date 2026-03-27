import type { Config } from "../config/config-schema.js";
import {
  buildRuntimeBehaviorFromSeed,
  buildRuntimeBehaviorSeed,
  deriveExecutionMode,
  RuntimeBehaviorPatchSchema,
  RuntimeConfigDocumentSchema,
  type RuntimeBehaviorPatch,
  type RuntimeConfigControlView,
  type RuntimeConfigStatus,
  type RuntimeMode,
  type RuntimeOverlay,
} from "../config/runtime-config-schema.js";
import {
  createRuntimeConfigRepository,
  type RuntimeConfigActiveRecord,
  type RuntimeConfigChangeLogRecord,
  type RuntimeConfigRepository,
  type RuntimeConfigVersionRecord,
} from "../persistence/runtime-config-repository.js";
import { createRuntimeConfigStore, type RuntimeConfigStore, type RuntimeSignalState } from "../storage/runtime-config-store.js";
import { configureRuntimeControlViewProvider } from "./live-control.js";
import { configureKillSwitchBridge, type KillSwitchState } from "../governance/kill-switch.js";

export interface RuntimeConfigMutationResult {
  accepted: boolean;
  action: "mode" | "pause" | "resume" | "kill_switch" | "runtime_config" | "reload" | "restart_ack" | "auth_failure";
  message: string;
  requestedVersionId?: string;
  appliedVersionId?: string;
  activeVersionId?: string;
  lastValidVersionId?: string;
  pendingApply: boolean;
  requiresRestart: boolean;
  reloadNonce: number;
  rejectionReason?: string;
  status: RuntimeConfigStatus;
}

export interface RuntimeConfigHistorySnapshot {
  versions: RuntimeConfigVersionRecord[];
  changes: RuntimeConfigChangeLogRecord[];
  active: RuntimeConfigActiveRecord | null;
}

export interface RuntimeConfigManagerOptions {
  environment?: string;
  repository?: RuntimeConfigRepository;
  store?: RuntimeConfigStore;
  databaseUrl?: string;
  redisUrl?: string;
  env?: NodeJS.ProcessEnv;
  bootstrapActor?: string;
  logger?: Pick<Console, "info" | "warn" | "error">;
}

interface RuntimeConfigState {
  version: RuntimeConfigVersionRecord;
  overlay: RuntimeOverlay;
  requestedAt: string;
  appliedAt?: string;
  pendingApply: boolean;
  requiresRestart: boolean;
}

interface ManagedRuntimeConfigState {
  seedSource: "boot" | "persisted";
  requested: RuntimeConfigState;
  applied: RuntimeConfigState;
  lastValidVersion: RuntimeConfigVersionRecord;
  active: RuntimeConfigActiveRecord;
  signal: RuntimeSignalState;
  degraded: boolean;
  degradedReason?: string;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function defaultOverlay(): RuntimeOverlay {
  return {
    paused: false,
    killSwitch: false,
    reloadNonce: 0,
    pendingRestart: false,
  };
}

function overlayKey(overlay: RuntimeOverlay): string {
  return JSON.stringify({
    paused: overlay.paused,
    pauseScope: overlay.pauseScope ?? null,
    pauseReason: overlay.pauseReason ?? null,
    killSwitch: overlay.killSwitch,
    killSwitchReason: overlay.killSwitchReason ?? null,
    reloadNonce: overlay.reloadNonce,
    pendingRestart: overlay.pendingRestart,
    pendingReason: overlay.pendingReason ?? null,
  });
}

function activeRecordKey(active: RuntimeConfigActiveRecord): string {
  return JSON.stringify({
    activeVersionId: active.activeVersionId,
    requestedVersionId: active.requestedVersionId,
    appliedVersionId: active.appliedVersionId,
    lastValidVersionId: active.lastValidVersionId,
    reloadNonce: active.reloadNonce,
    paused: active.paused,
    pauseScope: active.pauseScope ?? null,
    pauseReason: active.pauseReason ?? null,
    killSwitch: active.killSwitch,
    killSwitchReason: active.killSwitchReason ?? null,
    pendingApply: active.pendingApply,
    pendingReason: active.pendingReason ?? null,
    requiresRestart: active.requiresRestart,
    requestedAt: active.requestedAt,
    appliedAt: active.appliedAt ?? null,
    updatedAt: active.updatedAt,
  });
}

function signalKey(signal: RuntimeSignalState): string {
  return JSON.stringify({
    reloadNonce: signal.reloadNonce,
    paused: signal.paused,
    pauseScope: signal.pauseScope ?? null,
    pauseReason: signal.pauseReason ?? null,
    killSwitch: signal.killSwitch,
    killSwitchReason: signal.killSwitchReason ?? null,
    lastAppliedVersionId: signal.lastAppliedVersionId ?? null,
    lastValidVersionId: signal.lastValidVersionId ?? null,
    pendingApply: signal.pendingApply,
    pendingReason: signal.pendingReason ?? null,
  });
}

function makeState(
  version: RuntimeConfigVersionRecord,
  overlay: RuntimeOverlay,
  requestedAt: string,
  appliedAt?: string,
  pendingApply = false,
  requiresRestart = false
): RuntimeConfigState {
  return {
    version: clone(version),
    overlay: clone(overlay),
    requestedAt,
    appliedAt,
    pendingApply,
    requiresRestart,
  };
}

function buildDocument(state: RuntimeConfigState) {
  return RuntimeConfigDocumentSchema.parse({
    schemaVersion: 1,
    behavior: clone(state.version.config),
    overlay: clone(state.overlay),
  });
}

function restartRequiredForPatch(patch: RuntimeBehaviorPatch): boolean {
  return Boolean(
    patch.mode !== undefined ||
      patch.pollingIntervalMs !== undefined ||
      patch.executionToggles?.dryRun !== undefined ||
      patch.executionToggles?.liveTestMode !== undefined ||
      patch.executionToggles?.tradingEnabled !== undefined ||
      patch.thresholds?.circuitBreakerFailureThreshold !== undefined ||
      patch.thresholds?.circuitBreakerRecoveryMs !== undefined
  );
}

function buildStatus(environment: string, state: ManagedRuntimeConfigState): RuntimeConfigStatus {
  const applied = state.applied.version.config;
  return {
    environment,
    configured: true,
    seedSource: state.seedSource,
    requestedMode: state.requested.version.config.mode,
    appliedMode: state.applied.version.config.mode,
    requestedExecutionMode: deriveExecutionMode(state.requested.version.config.mode),
    appliedExecutionMode: deriveExecutionMode(state.applied.version.config.mode),
    rolloutPosture: applied.rolloutPosture,
    executionToggles: clone(applied.executionToggles),
    filters: clone(applied.filters),
    adapterToggles: clone(applied.adapterToggles),
    rateCaps: clone(applied.rateCaps),
    thresholds: clone(applied.thresholds),
    featureFlags: clone(applied.featureFlags),
    pollingIntervalMs: applied.pollingIntervalMs,
    requestedVersionId: state.requested.version.id,
    activeVersionId: state.active.activeVersionId,
    appliedVersionId: state.applied.version.id,
    lastValidVersionId: state.lastValidVersion.id,
    reloadNonce: state.requested.overlay.reloadNonce,
    lastAppliedReloadNonce: state.applied.overlay.reloadNonce,
    paused: state.applied.overlay.paused,
    pauseScope: state.applied.overlay.pauseScope,
    pauseReason: state.applied.overlay.pauseReason,
    killSwitch: state.applied.overlay.killSwitch,
    killSwitchReason: state.applied.overlay.killSwitchReason,
    pendingApply:
      state.requested.pendingApply ||
      state.requested.requiresRestart ||
      state.requested.version.id !== state.applied.version.id ||
      overlayKey(state.requested.overlay) !== overlayKey(state.applied.overlay),
    pendingReason: state.active.pendingReason,
    requiresRestart: state.requested.requiresRestart,
    degraded: state.degraded,
    degradedReason: state.degradedReason,
    effectiveVersionHash: state.applied.version.configHash,
    requestedAt: state.requested.requestedAt,
    appliedAt: state.applied.appliedAt,
    lastAppliedAt: state.applied.appliedAt,
  };
}

function buildControlView(state: ManagedRuntimeConfigState): RuntimeConfigControlView {
  const applied = state.applied.version.config;
  return {
    requestedMode: state.requested.version.config.mode,
    appliedMode: applied.mode,
    requestedExecutionMode: deriveExecutionMode(state.requested.version.config.mode),
    appliedExecutionMode: deriveExecutionMode(applied.mode),
    liveTestMode: applied.executionToggles.liveTestMode,
    rolloutPosture: applied.rolloutPosture,
    paused: state.applied.overlay.paused,
    pauseScope: state.applied.overlay.pauseScope,
    pauseReason: state.applied.overlay.pauseReason,
    killSwitch: state.applied.overlay.killSwitch,
    killSwitchReason: state.applied.overlay.killSwitchReason,
    reloadNonce: state.applied.overlay.reloadNonce,
    pendingApply:
      state.requested.pendingApply ||
      state.requested.requiresRestart ||
      state.requested.version.id !== state.applied.version.id ||
      overlayKey(state.requested.overlay) !== overlayKey(state.applied.overlay),
    pendingReason: state.active.pendingReason,
    requiresRestart: state.requested.requiresRestart,
    activeVersionId: state.active.activeVersionId,
    requestedVersionId: state.requested.version.id,
    appliedVersionId: state.applied.version.id,
    lastValidVersionId: state.lastValidVersion.id,
    filters: clone(applied.filters),
    adapterToggles: clone(applied.adapterToggles),
    rateCaps: clone(applied.rateCaps),
    thresholds: clone(applied.thresholds),
    featureFlags: clone(applied.featureFlags),
    pollingIntervalMs: applied.pollingIntervalMs,
    degraded: state.degraded,
    degradedReason: state.degradedReason,
    reasonCode: state.degraded ? "micro_live_config_invalid" : undefined,
    reasonDetail: state.degradedReason,
    lastReasonAt: state.active.updatedAt,
    lastOperatorAction: undefined,
    lastOperatorActionAt: state.active.updatedAt,
  };
}

function buildSignal(state: ManagedRuntimeConfigState): RuntimeSignalState {
  return {
    reloadNonce: state.requested.overlay.reloadNonce,
    paused: state.requested.overlay.paused,
    pauseScope: state.requested.overlay.pauseScope,
    pauseReason: state.requested.overlay.pauseReason,
    killSwitch: state.requested.overlay.killSwitch,
    killSwitchReason: state.requested.overlay.killSwitchReason,
    lastAppliedVersionId: state.applied.version.id,
    lastValidVersionId: state.lastValidVersion.id,
    pendingApply:
      state.requested.pendingApply ||
      state.requested.requiresRestart ||
      state.requested.version.id !== state.applied.version.id ||
      overlayKey(state.requested.overlay) !== overlayKey(state.applied.overlay),
    pendingReason: state.active.pendingReason,
  };
}

export class RuntimeConfigManager {
  private readonly environment: string;
  private readonly repository: RuntimeConfigRepository;
  private readonly store: RuntimeConfigStore;
  private readonly bootstrapActor: string;
  private readonly env: NodeJS.ProcessEnv;
  private readonly logger: Pick<Console, "info" | "warn" | "error">;
  private readonly bootConfig: Config;
  private state?: ManagedRuntimeConfigState;
  private pendingAppliedState?: RuntimeConfigState;
  private cycleDepth = 0;
  private mutationQueue: Promise<unknown> = Promise.resolve();
  private initialized = false;

  constructor(config: Config, options: RuntimeConfigManagerOptions = {}) {
    this.bootConfig = config;
    this.env = options.env ?? process.env;
    this.environment =
      options.environment ??
      this.env.RUNTIME_CONFIG_ENV?.trim() ??
      this.env.RENDER_SERVICE_NAME?.trim() ??
      config.nodeEnv ??
      "development";
    this.bootstrapActor = options.bootstrapActor ?? "bootstrap";
    this.logger = options.logger ?? console;
    this.repository = options.repository ?? new (class implements RuntimeConfigRepository {
      kind = "memory" as const;
      private active: RuntimeConfigActiveRecord | null = null;
      private versions: RuntimeConfigVersionRecord[] = [];
      private changes: RuntimeConfigChangeLogRecord[] = [];
      async ensureSchema(): Promise<void> {}
      async loadActive(): Promise<RuntimeConfigActiveRecord | null> { return this.active ? clone(this.active) : null; }
      async loadVersion(_environment: string, versionId: string): Promise<RuntimeConfigVersionRecord | null> {
        const version = this.versions.find((entry) => entry.id === versionId);
        return version ? clone(version) : null;
      }
      async listVersions(): Promise<RuntimeConfigVersionRecord[]> { return clone(this.versions).reverse(); }
      async listChangeLog(): Promise<RuntimeConfigChangeLogRecord[]> { return clone(this.changes).reverse(); }
      async getLatestVersionNumber(): Promise<number> { return this.versions.reduce((max, item) => Math.max(max, item.versionNumber), 0); }
      async seedEnvironment(input: any): Promise<any> {
        const version: RuntimeConfigVersionRecord = {
          id: "memory-seed",
          environment: input.environment,
          versionNumber: 1,
          schemaVersion: input.behavior.schemaVersion,
          config: clone(input.behavior),
          configHash: "memory-seed",
          status: "seeded",
          createdBy: input.actor,
          reason: input.reason,
          createdAt: new Date().toISOString(),
          activatedAt: new Date().toISOString(),
          activatedBy: input.actor,
          appliedAt: new Date().toISOString(),
          appliedBy: input.actor,
        };
        this.versions = [version];
        this.active = {
          environment: input.environment,
          activeVersionId: version.id,
          requestedVersionId: version.id,
          appliedVersionId: version.id,
          lastValidVersionId: version.id,
          reloadNonce: 0,
          paused: false,
          killSwitch: false,
          pendingApply: false,
          requiresRestart: false,
          requestedAt: version.createdAt,
          appliedAt: version.createdAt,
          updatedAt: version.createdAt,
        };
        return { version: clone(version), active: clone(this.active) };
      }
      async createVersion(input: any): Promise<RuntimeConfigVersionRecord> {
        const version: RuntimeConfigVersionRecord = {
          id: `memory-${this.versions.length + 1}`,
          environment: input.environment,
          versionNumber: input.versionNumber,
          schemaVersion: input.behavior.schemaVersion,
          config: clone(input.behavior),
          configHash: "memory-version",
          previousVersionId: input.previousVersionId,
          status: input.status ?? "active",
          createdBy: input.actor,
          reason: input.reason,
          createdAt: new Date().toISOString(),
          activatedAt: input.activatedAt,
          activatedBy: input.activatedBy,
          appliedAt: input.appliedAt,
          appliedBy: input.appliedBy,
        };
        this.versions.push(version);
        return clone(version);
      }
      async updateActive(input: any): Promise<RuntimeConfigActiveRecord> {
        this.active = {
          environment: input.environment,
          activeVersionId: input.activeVersionId,
          requestedVersionId: input.requestedVersionId,
          appliedVersionId: input.appliedVersionId,
          lastValidVersionId: input.lastValidVersionId,
          reloadNonce: input.reloadNonce,
          paused: input.paused,
          pauseScope: input.pauseScope,
          pauseReason: input.pauseReason,
          killSwitch: input.killSwitch,
          killSwitchReason: input.killSwitchReason,
          pendingApply: input.pendingApply,
          pendingReason: input.pendingReason,
          requiresRestart: input.requiresRestart,
          requestedAt: input.requestedAt,
          appliedAt: input.appliedAt,
          updatedAt: input.updatedAt ?? new Date().toISOString(),
        };
        return clone(this.active);
      }
      async appendChangeLog(input: any): Promise<void> {
        this.changes.push({
          id: `change-${this.changes.length + 1}`,
          environment: input.environment,
          versionId: input.versionId,
          action: input.action,
          actor: input.actor,
          accepted: input.accepted,
          beforeConfig: input.beforeConfig ?? null,
          afterConfig: input.afterConfig ?? null,
          beforeOverlay: input.beforeOverlay ?? null,
          afterOverlay: input.afterOverlay ?? null,
          reason: input.reason,
          rejectionReason: input.rejectionReason,
          resultVersionId: input.resultVersionId,
          reloadNonce: input.reloadNonce,
          createdAt: input.createdAt ?? new Date().toISOString(),
        });
      }
    })();
    this.store = options.store ?? new (class implements RuntimeConfigStore {
      kind = "memory" as const;
      private state: RuntimeSignalState = { reloadNonce: 0, paused: false, killSwitch: false, pendingApply: false };
      async load(): Promise<RuntimeSignalState | null> { return clone(this.state); }
      async save(state: RuntimeSignalState): Promise<void> { this.state = clone(state); }
      loadSync(): RuntimeSignalState | null { return clone(this.state); }
      saveSync(state: RuntimeSignalState): void { this.state = clone(state); }
    })();
  }

  static async create(config: Config, options: RuntimeConfigManagerOptions = {}): Promise<RuntimeConfigManager> {
    const repository = options.repository ?? (await createRuntimeConfigRepository(options.databaseUrl ?? process.env.DATABASE_URL));
    const store = options.store ?? (await createRuntimeConfigStore(options.redisUrl ?? process.env.REDIS_URL));
    return new RuntimeConfigManager(config, { ...options, repository, store });
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    await this.repository.ensureSchema();
    const seed = buildRuntimeBehaviorSeed(this.bootConfig, this.env);
    const active = await this.repository.loadActive(this.environment);
    let requestedVersion: RuntimeConfigVersionRecord;
    let appliedVersion: RuntimeConfigVersionRecord;
    let lastValidVersion: RuntimeConfigVersionRecord;
    let requestedOverlay: RuntimeOverlay;
    let requestedAt: string;

    if (!active) {
      const seeded = await this.repository.seedEnvironment({
        environment: this.environment,
        behavior: seed,
        actor: this.bootstrapActor,
        reason: "runtime config bootstrap seed",
      });
      requestedVersion = clone(seeded.version);
      appliedVersion = clone(seeded.version);
      lastValidVersion = clone(seeded.version);
      requestedOverlay = defaultOverlay();
      requestedAt = seeded.active.requestedAt;
    } else {
      const loadedRequested = await this.repository.loadVersion(this.environment, active.requestedVersionId);
      if (!loadedRequested) {
        throw new Error(`runtime config repository is inconsistent for environment '${this.environment}'`);
      }
      const loadedApplied =
        (await this.repository.loadVersion(this.environment, active.appliedVersionId)) ?? loadedRequested;
      const loadedLastValid = (await this.repository.loadVersion(this.environment, active.lastValidVersionId)) ?? loadedRequested;
      requestedVersion = clone(loadedRequested);
      appliedVersion = clone(loadedApplied);
      lastValidVersion = clone(loadedLastValid);
      requestedOverlay = {
        paused: active.paused,
        pauseScope: active.pauseScope,
        pauseReason: active.pauseReason,
        killSwitch: active.killSwitch,
        killSwitchReason: active.killSwitchReason,
        reloadNonce: active.reloadNonce,
        pendingRestart: active.requiresRestart,
        pendingReason: active.pendingReason,
      };
      requestedAt = active.requestedAt;
    }

    const appliedOverlay = clone(requestedOverlay);
    const appliedAt = active?.appliedAt ?? requestedAt;
    const requestedState = makeState(
      requestedVersion,
      requestedOverlay,
      requestedAt,
      appliedAt,
      Boolean(active?.pendingApply),
      Boolean(active?.requiresRestart)
    );
    const appliedState = makeState(appliedVersion, appliedOverlay, requestedAt, appliedAt, false, false);
    const activeRecord: RuntimeConfigActiveRecord = active ?? {
      environment: this.environment,
      activeVersionId: requestedVersion.id,
      requestedVersionId: requestedVersion.id,
      appliedVersionId: requestedVersion.id,
      lastValidVersionId: lastValidVersion.id,
      reloadNonce: requestedOverlay.reloadNonce,
      paused: requestedOverlay.paused,
      pauseScope: requestedOverlay.pauseScope,
      pauseReason: requestedOverlay.pauseReason,
      killSwitch: requestedOverlay.killSwitch,
      killSwitchReason: requestedOverlay.killSwitchReason,
      pendingApply: false,
      pendingReason: undefined,
      requiresRestart: false,
      requestedAt,
      appliedAt,
      updatedAt: requestedAt,
    };

    const initialState: ManagedRuntimeConfigState = {
      seedSource: active ? "persisted" : "boot",
      requested: requestedState,
      applied: appliedState,
      lastValidVersion,
      active: activeRecord,
      signal: {
        reloadNonce: requestedOverlay.reloadNonce,
        paused: requestedOverlay.paused,
        pauseScope: requestedOverlay.pauseScope,
        pauseReason: requestedOverlay.pauseReason,
        killSwitch: requestedOverlay.killSwitch,
        killSwitchReason: requestedOverlay.killSwitchReason,
        lastAppliedVersionId: appliedVersion.id,
        lastValidVersionId: lastValidVersion.id,
        pendingApply: false,
      },
      degraded: false,
    };
    const loadedSignal = await this.store.load().catch((error) => {
      this.logger.warn("[runtime-config] signal store unavailable", error);
      return null;
    });
    const desiredSignal = buildSignal(initialState);
    if (!loadedSignal || signalKey(loadedSignal) !== signalKey(desiredSignal)) {
      await this.store.save(desiredSignal).catch((error) => {
        this.logger.warn("[runtime-config] failed to seed signal state", error);
      });
    }
    initialState.signal = desiredSignal;
    this.state = initialState;
    this.initialized = true;
    await this.persistSnapshot(initialState);
    this.bindProviders();
  }

  beginCycle(): void {
    this.cycleDepth += 1;
  }

  async endCycle(): Promise<void> {
    if (this.cycleDepth > 0) {
      this.cycleDepth -= 1;
    }
    if (this.cycleDepth === 0 && this.pendingAppliedState && this.state) {
      const appliedAt = new Date().toISOString();
      this.state.applied = makeState(
        this.pendingAppliedState.version,
        this.pendingAppliedState.overlay,
        this.pendingAppliedState.requestedAt,
        appliedAt,
        false,
        false
      );
      this.state.lastValidVersion = clone(this.pendingAppliedState.version);
      this.state.active.appliedVersionId = this.pendingAppliedState.version.id;
      this.state.active.lastValidVersionId = this.pendingAppliedState.version.id;
      this.state.active.appliedAt = appliedAt;
      this.state.active.updatedAt = appliedAt;
      this.pendingAppliedState = undefined;
      this.state.requested.pendingApply = false;
      this.state.active.pendingApply = false;
      this.state.active.pendingReason = undefined;
      this.state.signal = buildSignal(this.state);
      try {
        await this.repository.updateActive({
          environment: this.environment,
          activeVersionId: this.state.active.activeVersionId,
          requestedVersionId: this.state.active.requestedVersionId,
          appliedVersionId: this.state.active.appliedVersionId,
          lastValidVersionId: this.state.active.lastValidVersionId,
          reloadNonce: this.state.active.reloadNonce,
          paused: this.state.active.paused,
          pauseScope: this.state.active.pauseScope,
          pauseReason: this.state.active.pauseReason,
          killSwitch: this.state.active.killSwitch,
          killSwitchReason: this.state.active.killSwitchReason,
          pendingApply: this.state.active.pendingApply,
          pendingReason: this.state.active.pendingReason,
          requiresRestart: this.state.active.requiresRestart,
          requestedAt: this.state.active.requestedAt,
          appliedAt: this.state.active.appliedAt,
          updatedAt: appliedAt,
        });
      } catch (error) {
        this.logger.warn("[runtime-config] failed to persist active state", error);
      }
      await this.store.save(this.state.signal).catch((error) => {
        this.logger.warn("[runtime-config] failed to persist signal state", error);
      });
    }
  }

  async refresh(): Promise<void> {
    this.assertInitialized();
    const active = await this.repository.loadActive(this.environment);
    if (!active || !this.state) {
      return;
    }

    if (activeRecordKey(active) === activeRecordKey(this.state.active)) {
      const desiredSignal = buildSignal(this.state);
      const loadedSignal = await this.store.load().catch((error) => {
        this.logger.warn("[runtime-config] failed to refresh signal state", error);
        return null;
      });
      if (!loadedSignal || signalKey(loadedSignal) !== signalKey(desiredSignal)) {
        await this.store.save(desiredSignal).catch((error) => {
          this.logger.warn("[runtime-config] failed to persist refreshed signal state", error);
        });
      }
      this.state.signal = desiredSignal;
      return;
    }

    const loadedRequested = await this.repository.loadVersion(this.environment, active.requestedVersionId);
    if (!loadedRequested) {
      throw new Error(`runtime config repository is inconsistent for environment '${this.environment}'`);
    }
    const loadedApplied =
      (await this.repository.loadVersion(this.environment, active.appliedVersionId)) ?? loadedRequested;
    const loadedLastValid =
      (await this.repository.loadVersion(this.environment, active.lastValidVersionId)) ?? loadedRequested;
    const requestedOverlay: RuntimeOverlay = {
      paused: active.paused,
      pauseScope: active.pauseScope,
      pauseReason: active.pauseReason,
      killSwitch: active.killSwitch,
      killSwitchReason: active.killSwitchReason,
      reloadNonce: active.reloadNonce,
      pendingRestart: active.requiresRestart,
      pendingReason: active.pendingReason,
    };
    const requestedState = makeState(
      clone(loadedRequested),
      clone(requestedOverlay),
      active.requestedAt,
      active.appliedAt ?? active.requestedAt,
      active.pendingApply,
      active.requiresRestart
    );
    const appliedState = makeState(
      clone(loadedApplied),
      clone(requestedOverlay),
      active.requestedAt,
      active.appliedAt ?? active.requestedAt,
      false,
      false
    );
    const nextState: ManagedRuntimeConfigState = {
      seedSource: this.state.seedSource,
      requested: requestedState,
      applied: appliedState,
      lastValidVersion: clone(loadedLastValid),
      active: clone(active),
      signal: buildSignal({
        seedSource: this.state.seedSource,
        requested: requestedState,
        applied: appliedState,
        lastValidVersion: clone(loadedLastValid),
        active: clone(active),
        signal: this.state.signal,
        degraded: this.state.degraded,
        degradedReason: this.state.degradedReason,
      }),
      degraded: this.state.degraded,
      degradedReason: this.state.degradedReason,
    };
    nextState.signal = buildSignal(nextState);

    this.state = nextState;
    this.pendingAppliedState = undefined;
    await this.store.save(nextState.signal).catch((error) => {
      this.logger.warn("[runtime-config] failed to persist signal state", error);
    });
  }

  getRuntimeConfigStatus(): RuntimeConfigStatus {
    this.assertInitialized();
    return buildStatus(this.environment, this.state!);
  }

  getRuntimeControlView(): RuntimeConfigControlView {
    this.assertInitialized();
    return buildControlView(this.state!);
  }

  getRuntimeConfigDocument() {
    this.assertInitialized();
    return buildDocument(this.state!.applied);
  }

  async getHistory(limit = 50): Promise<RuntimeConfigHistorySnapshot> {
    this.assertInitialized();
    const [versions, changes, active] = await Promise.all([
      this.repository.listVersions(this.environment, limit),
      this.repository.listChangeLog(this.environment, limit),
      this.repository.loadActive(this.environment),
    ]);
    return { versions, changes, active };
  }

  private bindProviders(): void {
    configureRuntimeControlViewProvider(() => this.getRuntimeControlView());
    configureKillSwitchBridge({
      read: () => this.getKillSwitchState(),
      write: async (next) => {
        await this.applyKillSwitchSnapshot(next, {
          actor: "legacy_runtime",
          reason: next.reason,
          sourceAction: next.halted ? "trigger" : "reset",
        });
      },
    });
  }

  private assertInitialized(): void {
    if (!this.initialized || !this.state) {
      throw new Error("RuntimeConfigManager has not been initialized");
    }
  }

  getKillSwitchState(): KillSwitchState {
    this.assertInitialized();
    const state = this.state;
    if (!state) {
      throw new Error("RuntimeConfigManager has not been initialized");
    }
    return {
      halted: state.applied.overlay.killSwitch,
      reason: state.applied.overlay.killSwitchReason,
      triggeredAt: state.active.updatedAt,
    };
  }

  private async enqueue<T>(
    action: RuntimeConfigMutationResult["action"],
    work: () => Promise<RuntimeConfigMutationResult>
  ): Promise<RuntimeConfigMutationResult> {
    this.mutationQueue = this.mutationQueue.then(() => work());
    try {
      return (await this.mutationQueue) as RuntimeConfigMutationResult;
    } catch (error) {
      return this.result(action, false, error instanceof Error ? error.message : String(error));
    }
  }

  private async persistSnapshot(state: ManagedRuntimeConfigState): Promise<void> {
    state.signal = buildSignal(state);
    await this.store.save(state.signal).catch((error) => {
      this.logger.warn("[runtime-config] failed to persist signal state", error);
    });
  }

  private async commitState(
    state: ManagedRuntimeConfigState,
    action: Exclude<RuntimeConfigMutationResult["action"], "restart_ack">,
    createdAt: string,
    change: Omit<RuntimeConfigChangeLogRecord, "id" | "environment" | "createdAt">
  ): Promise<void> {
    await this.repository.updateActive({
      environment: this.environment,
      activeVersionId: state.active.activeVersionId,
      requestedVersionId: state.active.requestedVersionId,
      appliedVersionId: state.active.appliedVersionId,
      lastValidVersionId: state.active.lastValidVersionId,
      reloadNonce: state.active.reloadNonce,
      paused: state.active.paused,
      pauseScope: state.active.pauseScope,
      pauseReason: state.active.pauseReason,
      killSwitch: state.active.killSwitch,
      killSwitchReason: state.active.killSwitchReason,
      pendingApply: state.active.pendingApply,
      pendingReason: state.active.pendingReason,
      requiresRestart: state.active.requiresRestart,
      requestedAt: state.active.requestedAt,
      appliedAt: state.active.appliedAt,
      updatedAt: createdAt,
    });

    await this.repository.appendChangeLog({
      ...change,
      environment: this.environment,
      action,
      reloadNonce: state.signal.reloadNonce,
      createdAt,
    });

    await this.persistSnapshot(state);
  }

  private result(
    action: RuntimeConfigMutationResult["action"],
    accepted: boolean,
    rejectionReason?: string,
    appliedVersionId?: string
  ): RuntimeConfigMutationResult {
    const status = this.getRuntimeConfigStatus();
    return {
      accepted,
      action,
      message: accepted ? `${action} accepted` : `${action} rejected`,
      requestedVersionId: status.requestedVersionId,
      appliedVersionId: appliedVersionId ?? status.appliedVersionId,
      activeVersionId: status.activeVersionId,
      lastValidVersionId: status.lastValidVersionId,
      pendingApply: status.pendingApply,
      requiresRestart: status.requiresRestart,
      reloadNonce: status.reloadNonce,
      rejectionReason,
      status,
    };
  }

  async applyBehaviorPatch(input: { patch: RuntimeBehaviorPatch; actor: string; reason?: string; idempotencyKey?: string }): Promise<RuntimeConfigMutationResult> {
    return this.enqueue("runtime_config", async () => {
      this.assertInitialized();
      let patch: RuntimeBehaviorPatch;
      try {
        patch = RuntimeBehaviorPatchSchema.parse(input.patch);
      } catch (error) {
        const createdAt = new Date().toISOString();
        await this.repository.appendChangeLog({
          environment: this.environment,
          versionId: this.state!.requested.version.id,
          action: "runtime_config",
          actor: input.actor,
          accepted: false,
          beforeConfig: this.state!.requested.version.config,
          afterConfig: this.state!.requested.version.config,
          beforeOverlay: this.state!.requested.overlay,
          afterOverlay: this.state!.requested.overlay,
          reason: input.reason,
          rejectionReason: error instanceof Error ? error.message : String(error),
          resultVersionId: this.state!.requested.version.id,
          reloadNonce: this.state!.requested.overlay.reloadNonce,
          createdAt,
        });
        return this.result("runtime_config", false, error instanceof Error ? error.message : String(error));
      }

      const base = this.state!;
      const createdAt = new Date().toISOString();
      const nextBehavior = buildRuntimeBehaviorFromSeed(base.requested.version.config, patch);
      const requiresRestart = restartRequiredForPatch(patch);
      const versionNumber = (await this.repository.getLatestVersionNumber(this.environment)) + 1;
      const nextVersion = await this.repository.createVersion({
        environment: this.environment,
        versionNumber,
        behavior: nextBehavior,
        overlay: base.requested.overlay,
        actor: input.actor,
        reason: input.reason ?? "runtime config patch",
        previousVersionId: base.requested.version.id,
        status: "active",
      });
      const requestedOverlay: RuntimeOverlay = {
        ...base.requested.overlay,
        pendingRestart: requiresRestart,
        pendingReason: requiresRestart ? "runtime config change requires restart" : undefined,
      };
      const appliedNow = !requiresRestart && this.cycleDepth === 0;
      const requested: RuntimeConfigState = makeState(
        nextVersion,
        requestedOverlay,
        createdAt,
        appliedNow ? createdAt : base.applied.appliedAt,
        !appliedNow,
        requiresRestart
      );
      const applied = appliedNow ? makeState(nextVersion, requestedOverlay, createdAt, createdAt, false, false) : clone(base.applied);
      const nextState: ManagedRuntimeConfigState = {
        seedSource: base.seedSource,
        requested,
        applied,
        lastValidVersion: appliedNow ? clone(nextVersion) : clone(base.lastValidVersion),
        active: {
          environment: this.environment,
          activeVersionId: nextVersion.id,
          requestedVersionId: nextVersion.id,
          appliedVersionId: appliedNow ? nextVersion.id : base.applied.version.id,
          lastValidVersionId: appliedNow ? nextVersion.id : base.lastValidVersion.id,
          reloadNonce: requested.overlay.reloadNonce,
          paused: requested.overlay.paused,
          pauseScope: requested.overlay.pauseScope,
          pauseReason: requested.overlay.pauseReason,
          killSwitch: requested.overlay.killSwitch,
          killSwitchReason: requested.overlay.killSwitchReason,
          pendingApply: requested.pendingApply,
          pendingReason: requested.overlay.pendingReason,
          requiresRestart,
          requestedAt: createdAt,
          appliedAt: appliedNow ? createdAt : base.applied.appliedAt,
          updatedAt: createdAt,
        },
        signal: buildSignal(base),
        degraded: base.degraded,
        degradedReason: base.degradedReason,
      };

      if (!appliedNow) {
        nextState.requested.pendingApply = true;
        nextState.active.pendingApply = true;
        nextState.active.pendingReason = "runtime config change queued until cycle boundary";
      }
      this.pendingAppliedState = !requiresRestart && !appliedNow ? clone(requested) : undefined;

      this.state = nextState;

      await this.repository.updateActive({
        environment: this.environment,
        activeVersionId: nextVersion.id,
        requestedVersionId: nextVersion.id,
        appliedVersionId: appliedNow ? nextVersion.id : base.applied.version.id,
        lastValidVersionId: appliedNow ? nextVersion.id : base.lastValidVersion.id,
        reloadNonce: requested.overlay.reloadNonce,
        paused: requested.overlay.paused,
        pauseScope: requested.overlay.pauseScope,
        pauseReason: requested.overlay.pauseReason,
        killSwitch: requested.overlay.killSwitch,
        killSwitchReason: requested.overlay.killSwitchReason,
        pendingApply: requested.pendingApply,
        pendingReason: requested.overlay.pendingReason,
        requiresRestart,
        requestedAt: createdAt,
        appliedAt: appliedNow ? createdAt : base.applied.appliedAt,
        updatedAt: createdAt,
      });
      await this.repository.appendChangeLog({
        environment: this.environment,
        versionId: nextVersion.id,
        action: "runtime_config",
        actor: input.actor,
        accepted: true,
        beforeConfig: base.requested.version.config,
        afterConfig: nextBehavior,
        beforeOverlay: base.requested.overlay,
        afterOverlay: requestedOverlay,
        reason: input.reason,
        resultVersionId: nextVersion.id,
        reloadNonce: requested.overlay.reloadNonce,
        createdAt,
      });

      if (appliedNow) {
        await this.persistSnapshot(this.state);
      } else {
        this.state.signal = buildSignal(this.state);
      }

      return this.result("runtime_config", true, undefined, appliedNow ? nextVersion.id : base.applied.version.id);
    });
  }

  async setMode(mode: RuntimeMode, input: { actor: string; reason?: string } = { actor: "operator" }): Promise<RuntimeConfigMutationResult> {
    return this.applyBehaviorPatch({ patch: { mode }, actor: input.actor, reason: input.reason ?? `mode set to ${mode}` });
  }

  async setPause(input: { scope: "soft" | "hard"; actor: string; reason?: string }): Promise<RuntimeConfigMutationResult> {
    return this.enqueue("pause", async () => {
      this.assertInitialized();
      const base = this.state!;
      const createdAt = new Date().toISOString();
      const requestedOverlay: RuntimeOverlay = {
        ...base.requested.overlay,
        paused: true,
        pauseScope: input.scope,
        pauseReason: input.reason ?? `${input.scope} pause`,
      };
      const requested = makeState(base.requested.version, requestedOverlay, createdAt, base.applied.appliedAt, this.cycleDepth > 0, false);
      const applied = this.cycleDepth > 0 ? clone(base.applied) : makeState(base.requested.version, requestedOverlay, createdAt, createdAt, false, false);
      const nextState: ManagedRuntimeConfigState = {
        ...base,
        requested,
        applied,
        active: {
          ...base.active,
          activeVersionId: base.requested.version.id,
          requestedVersionId: base.requested.version.id,
          appliedVersionId: applied.version.id,
          lastValidVersionId: base.lastValidVersion.id,
          reloadNonce: requestedOverlay.reloadNonce,
          paused: true,
          pauseScope: input.scope,
          pauseReason: requestedOverlay.pauseReason,
          pendingApply: this.cycleDepth > 0,
          pendingReason: this.cycleDepth > 0 ? "pause queued until cycle boundary" : undefined,
          requestedAt: createdAt,
          appliedAt: applied.appliedAt ?? createdAt,
          updatedAt: createdAt,
        },
      };

      this.state = nextState;
      await this.repository.updateActive({
        environment: this.environment,
        activeVersionId: base.requested.version.id,
        requestedVersionId: base.requested.version.id,
        appliedVersionId: applied.version.id,
        lastValidVersionId: base.lastValidVersion.id,
        reloadNonce: requestedOverlay.reloadNonce,
        paused: true,
        pauseScope: input.scope,
        pauseReason: requestedOverlay.pauseReason,
        killSwitch: requestedOverlay.killSwitch,
        killSwitchReason: requestedOverlay.killSwitchReason,
        pendingApply: this.cycleDepth > 0,
        pendingReason: this.cycleDepth > 0 ? "pause queued until cycle boundary" : undefined,
        requiresRestart: false,
        requestedAt: createdAt,
        appliedAt: applied.appliedAt ?? createdAt,
        updatedAt: createdAt,
      });
      await this.repository.appendChangeLog({
        environment: this.environment,
        versionId: base.requested.version.id,
        action: "pause",
        actor: input.actor,
        accepted: true,
        beforeConfig: base.requested.version.config,
        afterConfig: base.requested.version.config,
        beforeOverlay: base.requested.overlay,
        afterOverlay: requestedOverlay,
        reason: input.reason,
        resultVersionId: base.requested.version.id,
        reloadNonce: requestedOverlay.reloadNonce,
        createdAt,
      });
      if (this.cycleDepth === 0) {
        await this.persistSnapshot(this.state);
      } else {
        this.pendingAppliedState = clone(requested);
      }
      return this.result("pause", true, undefined, applied.version.id);
    });
  }

  async resume(input: { actor: string; reason?: string }): Promise<RuntimeConfigMutationResult> {
    return this.enqueue("resume", async () => {
      this.assertInitialized();
      const base = this.state!;
      if (base.requested.overlay.killSwitch) {
        const createdAt = new Date().toISOString();
        await this.repository.appendChangeLog({
          environment: this.environment,
          versionId: base.requested.version.id,
          action: "resume",
          actor: input.actor,
          accepted: false,
          beforeConfig: base.requested.version.config,
          afterConfig: base.requested.version.config,
          beforeOverlay: base.requested.overlay,
          afterOverlay: base.requested.overlay,
          reason: input.reason,
          rejectionReason: "kill switch is active",
          resultVersionId: base.requested.version.id,
          reloadNonce: base.requested.overlay.reloadNonce,
          createdAt,
        });
        return this.result("resume", false, "kill switch is active", base.applied.version.id);
      }

      const createdAt = new Date().toISOString();
      const requestedOverlay: RuntimeOverlay = {
        ...base.requested.overlay,
        paused: false,
        pauseScope: undefined,
        pauseReason: undefined,
      };
      const requested = makeState(base.requested.version, requestedOverlay, createdAt, base.applied.appliedAt, this.cycleDepth > 0, false);
      const applied = this.cycleDepth > 0 ? clone(base.applied) : makeState(base.requested.version, requestedOverlay, createdAt, createdAt, false, false);
      const nextState: ManagedRuntimeConfigState = {
        ...base,
        requested,
        applied,
        active: {
          ...base.active,
          activeVersionId: base.requested.version.id,
          requestedVersionId: base.requested.version.id,
          appliedVersionId: applied.version.id,
          lastValidVersionId: base.lastValidVersion.id,
          reloadNonce: requestedOverlay.reloadNonce,
          paused: false,
          pauseScope: undefined,
          pauseReason: undefined,
          pendingApply: this.cycleDepth > 0,
          pendingReason: this.cycleDepth > 0 ? "resume queued until cycle boundary" : undefined,
          requestedAt: createdAt,
          appliedAt: applied.appliedAt ?? createdAt,
          updatedAt: createdAt,
        },
      };

      this.state = nextState;
      await this.repository.updateActive({
        environment: this.environment,
        activeVersionId: base.requested.version.id,
        requestedVersionId: base.requested.version.id,
        appliedVersionId: applied.version.id,
        lastValidVersionId: base.lastValidVersion.id,
        reloadNonce: requestedOverlay.reloadNonce,
        paused: false,
        pauseScope: undefined,
        pauseReason: undefined,
        killSwitch: requestedOverlay.killSwitch,
        killSwitchReason: requestedOverlay.killSwitchReason,
        pendingApply: this.cycleDepth > 0,
        pendingReason: this.cycleDepth > 0 ? "resume queued until cycle boundary" : undefined,
        requiresRestart: false,
        requestedAt: createdAt,
        appliedAt: applied.appliedAt ?? createdAt,
        updatedAt: createdAt,
      });
      await this.repository.appendChangeLog({
        environment: this.environment,
        versionId: base.requested.version.id,
        action: "resume",
        actor: input.actor,
        accepted: true,
        beforeConfig: base.requested.version.config,
        afterConfig: base.requested.version.config,
        beforeOverlay: base.requested.overlay,
        afterOverlay: requestedOverlay,
        reason: input.reason,
        resultVersionId: base.requested.version.id,
        reloadNonce: requestedOverlay.reloadNonce,
        createdAt,
      });
      if (this.cycleDepth === 0) {
        await this.persistSnapshot(this.state);
      } else {
        this.pendingAppliedState = clone(requested);
      }
      return this.result("resume", true, undefined, applied.version.id);
    });
  }

  async setKillSwitch(input: { action: "trigger" | "reset"; actor: string; reason?: string }): Promise<RuntimeConfigMutationResult> {
    return this.applyKillSwitchSnapshot(
      {
        halted: input.action === "trigger",
        reason: input.reason,
        triggeredAt: new Date().toISOString(),
      },
      {
        actor: input.actor,
        reason: input.reason,
        sourceAction: input.action,
      }
    );
  }

  async reload(input: { actor: string; reason?: string }): Promise<RuntimeConfigMutationResult> {
    return this.enqueue("reload", async () => {
      this.assertInitialized();
      const base = this.state!;
      const createdAt = new Date().toISOString();
      const pendingApply = this.cycleDepth > 0 || base.requested.requiresRestart;
      const requestedOverlay: RuntimeOverlay = {
        ...base.requested.overlay,
        reloadNonce: base.requested.overlay.reloadNonce + 1,
        pendingRestart: base.requested.requiresRestart,
        pendingReason: input.reason ?? base.active.pendingReason,
      };
      const requested = makeState(
        base.requested.version,
        requestedOverlay,
        createdAt,
        base.applied.appliedAt,
        pendingApply,
        base.requested.requiresRestart
      );
      const applied =
        base.requested.requiresRestart || this.cycleDepth > 0
          ? clone(base.applied)
          : makeState(base.requested.version, requestedOverlay, createdAt, createdAt, false, false);
      const nextState: ManagedRuntimeConfigState = {
        ...base,
        requested,
        applied,
        active: {
          ...base.active,
          activeVersionId: base.requested.version.id,
          requestedVersionId: base.requested.version.id,
          appliedVersionId: applied.version.id,
          lastValidVersionId: base.lastValidVersion.id,
          reloadNonce: requestedOverlay.reloadNonce,
          pendingApply,
          pendingReason: pendingApply ? input.reason ?? "reload requested" : undefined,
          requiresRestart: base.requested.requiresRestart,
          requestedAt: createdAt,
          appliedAt: applied.appliedAt ?? createdAt,
          updatedAt: createdAt,
        },
      };

      this.state = nextState;
      await this.repository.updateActive({
        environment: this.environment,
        activeVersionId: base.requested.version.id,
        requestedVersionId: base.requested.version.id,
        appliedVersionId: applied.version.id,
        lastValidVersionId: base.lastValidVersion.id,
        reloadNonce: requestedOverlay.reloadNonce,
        paused: requestedOverlay.paused,
        pauseScope: requestedOverlay.pauseScope,
        pauseReason: requestedOverlay.pauseReason,
        killSwitch: requestedOverlay.killSwitch,
        killSwitchReason: requestedOverlay.killSwitchReason,
        pendingApply,
        pendingReason: pendingApply ? input.reason ?? "reload requested" : undefined,
        requiresRestart: base.requested.requiresRestart,
        requestedAt: createdAt,
        appliedAt: applied.appliedAt ?? createdAt,
        updatedAt: createdAt,
      });
      await this.repository.appendChangeLog({
        environment: this.environment,
        versionId: base.requested.version.id,
        action: "reload",
        actor: input.actor,
        accepted: true,
        beforeConfig: base.requested.version.config,
        afterConfig: base.requested.version.config,
        beforeOverlay: base.requested.overlay,
        afterOverlay: requestedOverlay,
        reason: input.reason,
        resultVersionId: base.requested.version.id,
        reloadNonce: requestedOverlay.reloadNonce,
        createdAt,
      });
      if (this.cycleDepth > 0 && !base.requested.requiresRestart) {
        this.pendingAppliedState = clone(requested);
      } else if (this.cycleDepth === 0 && !base.requested.requiresRestart) {
        await this.persistSnapshot(this.state);
      }
      return this.result("reload", true, undefined, applied.version.id);
    });
  }

  async confirmRestartApplied(input: { actor: string; reason?: string } = { actor: "worker" }): Promise<RuntimeConfigMutationResult> {
    return this.enqueue("restart_ack", async () => {
      this.assertInitialized();
      const base = this.state!;
      if (!base.active.requiresRestart) {
        return this.result("restart_ack", true, undefined, base.applied.version.id);
      }

      const createdAt = new Date().toISOString();
      const requestedOverlay: RuntimeOverlay = {
        ...base.requested.overlay,
        pendingRestart: false,
        pendingReason: undefined,
      };
      const applied = makeState(
        base.requested.version,
        requestedOverlay,
        base.requested.requestedAt,
        createdAt,
        false,
        false
      );
      const nextState: ManagedRuntimeConfigState = {
        ...base,
        requested: {
          ...base.requested,
          overlay: requestedOverlay,
          pendingApply: false,
          requiresRestart: false,
        },
        applied,
        lastValidVersion: clone(base.requested.version),
        active: {
          ...base.active,
          appliedVersionId: base.requested.version.id,
          lastValidVersionId: base.requested.version.id,
          appliedAt: createdAt,
          updatedAt: createdAt,
          pendingApply: false,
          pendingReason: undefined,
          requiresRestart: false,
        },
      };

      this.state = nextState;
      this.pendingAppliedState = undefined;
      await this.repository.updateActive({
        environment: this.environment,
        activeVersionId: nextState.active.activeVersionId,
        requestedVersionId: nextState.active.requestedVersionId,
        appliedVersionId: nextState.active.appliedVersionId,
        lastValidVersionId: nextState.active.lastValidVersionId,
        reloadNonce: nextState.active.reloadNonce,
        paused: nextState.active.paused,
        pauseScope: nextState.active.pauseScope,
        pauseReason: nextState.active.pauseReason,
        killSwitch: nextState.active.killSwitch,
        killSwitchReason: nextState.active.killSwitchReason,
        pendingApply: nextState.active.pendingApply,
        pendingReason: nextState.active.pendingReason,
        requiresRestart: nextState.active.requiresRestart,
        requestedAt: nextState.active.requestedAt,
        appliedAt: nextState.active.appliedAt,
        updatedAt: createdAt,
      });
      await this.persistSnapshot(this.state);
      return this.result("restart_ack", true, undefined, base.requested.version.id);
    });
  }

  async recordAuthFailure(input: { actor: string; action: string; reason?: string }): Promise<void> {
    this.assertInitialized();
    await this.repository.appendChangeLog({
      environment: this.environment,
      versionId: this.state!.requested.version.id,
      action: "auth_failure",
      actor: input.actor,
      accepted: false,
      beforeConfig: this.state!.requested.version.config,
      afterConfig: this.state!.requested.version.config,
      beforeOverlay: this.state!.requested.overlay,
      afterOverlay: this.state!.requested.overlay,
      reason: input.reason,
      rejectionReason: `unauthorized ${input.action}`,
      resultVersionId: this.state!.requested.version.id,
      reloadNonce: this.state!.requested.overlay.reloadNonce,
      createdAt: new Date().toISOString(),
    });
  }

  async applyKillSwitchSnapshot(
    next: KillSwitchState,
    input: { actor: string; reason?: string; sourceAction: "trigger" | "reset" }
  ): Promise<RuntimeConfigMutationResult> {
    return this.enqueue("kill_switch", async () => {
      this.assertInitialized();
      const base = this.state!;
      const createdAt = next.triggeredAt ?? new Date().toISOString();
      const requestedOverlay: RuntimeOverlay = {
        ...base.requested.overlay,
        killSwitch: next.halted,
        killSwitchReason: next.halted ? next.reason ?? input.reason ?? "kill-switch" : undefined,
        paused: next.halted ? true : base.requested.overlay.paused,
        pauseScope: next.halted ? "hard" : base.requested.overlay.pauseScope,
        pauseReason: next.halted ? next.reason ?? input.reason ?? "kill-switch" : base.requested.overlay.pauseReason,
      };
      const requested = makeState(base.requested.version, requestedOverlay, createdAt, base.applied.appliedAt, this.cycleDepth > 0, false);
      const applied = this.cycleDepth > 0 ? clone(base.applied) : makeState(base.requested.version, requestedOverlay, createdAt, createdAt, false, false);
      const nextState: ManagedRuntimeConfigState = {
        ...base,
        requested,
        applied,
        active: {
          ...base.active,
          activeVersionId: base.requested.version.id,
          requestedVersionId: base.requested.version.id,
          appliedVersionId: applied.version.id,
          lastValidVersionId: base.lastValidVersion.id,
          reloadNonce: requestedOverlay.reloadNonce,
          paused: requestedOverlay.paused,
          pauseScope: requestedOverlay.pauseScope,
          pauseReason: requestedOverlay.pauseReason,
          killSwitch: requestedOverlay.killSwitch,
          killSwitchReason: requestedOverlay.killSwitchReason,
          pendingApply: this.cycleDepth > 0,
          pendingReason: this.cycleDepth > 0 ? "kill switch queued until cycle boundary" : undefined,
          requestedAt: createdAt,
          appliedAt: applied.appliedAt ?? createdAt,
          updatedAt: createdAt,
        },
      };

      this.state = nextState;
      await this.repository.updateActive({
        environment: this.environment,
        activeVersionId: base.requested.version.id,
        requestedVersionId: base.requested.version.id,
        appliedVersionId: applied.version.id,
        lastValidVersionId: base.lastValidVersion.id,
        reloadNonce: requestedOverlay.reloadNonce,
        paused: requestedOverlay.paused,
        pauseScope: requestedOverlay.pauseScope,
        pauseReason: requestedOverlay.pauseReason,
        killSwitch: requestedOverlay.killSwitch,
        killSwitchReason: requestedOverlay.killSwitchReason,
        pendingApply: this.cycleDepth > 0,
        pendingReason: this.cycleDepth > 0 ? "kill switch queued until cycle boundary" : undefined,
        requiresRestart: false,
        requestedAt: createdAt,
        appliedAt: applied.appliedAt ?? createdAt,
        updatedAt: createdAt,
      });
      await this.repository.appendChangeLog({
        environment: this.environment,
        versionId: base.requested.version.id,
        action: "kill_switch",
        actor: input.actor,
        accepted: true,
        beforeConfig: base.requested.version.config,
        afterConfig: base.requested.version.config,
        beforeOverlay: base.requested.overlay,
        afterOverlay: requestedOverlay,
        reason: input.reason ?? next.reason,
        resultVersionId: base.requested.version.id,
        reloadNonce: requestedOverlay.reloadNonce,
        createdAt,
      });
      if (this.cycleDepth === 0) {
        await this.persistSnapshot(this.state);
      } else {
        this.pendingAppliedState = clone(requested);
      }
      return this.result("kill_switch", true, undefined, applied.version.id);
    });
  }
}
