import type { Config } from "../config/config-schema.js";
import type { RuntimeConfigManager } from "./runtime-config-manager.js";
import type { Clock } from "../core/clock.js";
import { SystemClock } from "../core/clock.js";
import type { MarketSnapshot } from "../core/contracts/market.js";
import type { WalletSnapshot } from "../core/contracts/wallet.js";
import type { SignalPack } from "../core/contracts/signalpack.js";
import type { TradeIntent, ExecutionReport, RpcVerificationReport } from "../core/contracts/trade.js";
import { Engine } from "../core/engine.js";
import type { EngineState } from "../core/engine.js";
import type { JournalWriter } from "../journal-writer/writer.js";
import { FileSystemJournalWriter } from "../journal-writer/writer.js";
import { RepositoryIncidentRecorder, type IncidentRecorder } from "../observability/incidents.js";
import type { IncidentRecord, IncidentRepository } from "../persistence/incident-repository.js";
import { FileSystemIncidentRepository } from "../persistence/incident-repository.js";
import {
  FileSystemRuntimeCycleSummaryWriter,
  type RuntimeCycleSummary,
  type RuntimeCycleSummaryWriter,
} from "../persistence/runtime-cycle-summary-repository.js";
import {
  FileSystemExecutionRepository,
  type ExecutionEvidenceRepository,
} from "../persistence/execution-repository.js";
import {
  FileSystemKillSwitchRepository,
  type KillSwitchRepository,
} from "../persistence/kill-switch-repository.js";
import {
  FileSystemLiveControlRepository,
  type LiveControlRepository,
} from "../persistence/live-control-repository.js";
import {
  FileSystemDailyLossRepository,
  type DailyLossRepository,
} from "../persistence/daily-loss-repository.js";
import {
  FileSystemIdempotencyRepository,
  type IdempotencyRepository,
} from "../persistence/idempotency-repository.js";
import {
  configureKillSwitchRepository,
  getKillSwitchState,
  hydrateKillSwitchState,
  isKillSwitchHalted,
  loadKillSwitchState,
  resetKillSwitch,
  triggerKillSwitch,
} from "../governance/kill-switch.js";
import {
  configureDailyLossRepository,
  createDailyLossTracker,
  hydrateDailyLossState,
  loadDailyLossState,
  recordTrade,
} from "../governance/daily-loss-tracker.js";
import {
  armMicroLive,
  completeLiveTestRound,
  configureLiveControlRepository,
  disarmMicroLive,
  getMicroLiveControlSnapshot,
  hydrateLiveControlState,
  loadLiveControlState,
  preflightLiveTestRound,
  resetKilledMicroLive,
  resetLiveTestRound,
  startLiveTestRound,
  stopLiveTestRound,
} from "./live-control.js";
import { createAdaptersWithCircuitBreaker } from "../adapters/adapters-with-cb.js";
import { createIngestHandler, type IngestAgentConfig } from "../agents/ingest.agent.js";
import { createExecutionHandler, type ExecutionHandlerDeps } from "../agents/execution.agent.js";
import { createRpcClient, type RpcClient } from "../adapters/rpc-verify/client.js";
import { createSignerFromConfig, type Signer } from "../adapters/signer/index.js";
import { runScoringEngine } from "../scoring/scoring-engine.js";
import { recognizePatterns } from "../patterns/pattern-engine.js";
import { runRiskEngine } from "../risk/risk-engine.js";
import { runSignalEngine } from "../signals/signal-engine.js";
import { createCanonicalDecisionAuthority, type DecisionCoordinator } from "../core/decision/index.js";
import { type RuntimeController } from "./controller.js";
import type {
  RuntimeControlResult,
  RuntimeSnapshot,
  RuntimeStatus,
} from "./dry-run-runtime.js";
import { assertLiveTradingPrerequisites, assertRuntimePolicyAuthority } from "../config/safety.js";

const DEFAULT_LIVE_TOKEN_ID = "So11111111111111111111111111111111111111112";
const RECENT_CYCLE_LIMIT = 10;
const RECENT_INCIDENT_LIMIT = 20;

export interface LiveRuntimeDeps {
  ingestHandler?: () => Promise<{ market: MarketSnapshot; wallet: WalletSnapshot }>;
  executionHandlerFactory?: typeof createExecutionHandler;
  engine?: Engine;
  clock?: Clock;
  decisionCoordinator?: DecisionCoordinator;
  runtimeConfigManager?: RuntimeConfigManager;
  rpcClient?: RpcClient;
  signer?: Signer;
  buildSwapTransaction?: ExecutionHandlerDeps["buildSwapTransaction"];
  verifyTransaction?: ExecutionHandlerDeps["verifyTransaction"];
  journalWriter?: JournalWriter;
  incidentRecorder?: IncidentRecorder;
  cycleSummaryWriter?: RuntimeCycleSummaryWriter;
  executionEvidenceRepository?: ExecutionEvidenceRepository;
  killSwitchRepository?: KillSwitchRepository;
  liveControlRepository?: LiveControlRepository;
  dailyLossRepository?: DailyLossRepository;
  idempotencyRepository?: IdempotencyRepository;
  logger?: Pick<Console, "info" | "error">;
  loopIntervalMs?: number;
}

interface LiveRuntimeResolvedDeps {
  ingestHandler: () => Promise<{ market: MarketSnapshot; wallet: WalletSnapshot }>;
  executionHandler: (intent: TradeIntent) => Promise<ExecutionReport>;
  engine: Engine;
  journalWriter: JournalWriter;
  incidentRecorder: IncidentRecorder;
  cycleSummaryWriter: RuntimeCycleSummaryWriter;
  executionEvidenceRepository: ExecutionEvidenceRepository;
  killSwitchRepository: KillSwitchRepository;
  liveControlRepository: LiveControlRepository;
  dailyLossRepository: DailyLossRepository;
  idempotencyRepository: IdempotencyRepository;
  clock: Clock;
  decisionCoordinator: DecisionCoordinator;
  runtimeConfigManager?: RuntimeConfigManager;
  logger: Pick<Console, "info" | "error">;
  loopIntervalMs: number;
}

function derivePersistenceBasePath(config: Config): string {
  return config.journalPath.replace(/\.jsonl$/i, "");
}

function createDefaultSafetyRepos(config: Config): {
  killSwitchRepository: KillSwitchRepository;
  liveControlRepository: LiveControlRepository;
  dailyLossRepository: DailyLossRepository;
  idempotencyRepository: IdempotencyRepository;
} {
  const basePath = derivePersistenceBasePath(config);
  return {
    killSwitchRepository: new FileSystemKillSwitchRepository(`${basePath}.kill-switch.json`),
    liveControlRepository: new FileSystemLiveControlRepository(`${basePath}.live-control.json`),
    dailyLossRepository: new FileSystemDailyLossRepository(`${basePath}.daily-loss.json`),
    idempotencyRepository: new FileSystemIdempotencyRepository(`${basePath}.idempotency.json`),
  };
}

function loadOrThrow<T>(value: T | null, label: string): T {
  if (value == null) {
    throw new Error(`LIVE_BOOT_ABORTED_DURABLE_STATE_UNAVAILABLE:${label}`);
  }
  return value;
}

function assertRepositoryKind(name: string, repo: { kind: string }): void {
  if (repo.kind !== "file") {
    throw new Error(`LIVE_BOOT_ABORTED_IN_MEMORY_SAFETY_REPOSITORY:${name}`);
  }
}

function buildSignalPack(market: MarketSnapshot, traceId: string, timestamp: string): SignalPack {
  return {
    traceId,
    timestamp,
    signals: [
      {
        source: "paprika",
        timestamp,
        poolId: market.poolId,
        baseToken: market.baseToken,
        quoteToken: market.quoteToken,
        priceUsd: market.priceUsd,
        volume24h: market.volume24h,
        liquidity: market.liquidity,
      },
    ],
    dataQuality: {
      completeness: 1,
      freshness: market.freshnessMs == null ? 1 : Math.max(0, 1 - Math.min(market.freshnessMs, 10_000) / 10_000),
      sourceReliability: 1,
      crossSourceConfidence: 1,
    },
    sources: ["paprika"],
  };
}

function estimateLossUsd(intent: TradeIntent, report: ExecutionReport, priceUsd?: number): number {
  const expected = Number.parseFloat(intent.minAmountOut);
  const actual = Number.parseFloat(report.actualAmountOut ?? intent.minAmountOut);
  if (!Number.isFinite(expected) || !Number.isFinite(actual) || actual >= expected) {
    return 0;
  }

  const lossUnits = expected - actual;
  if (intent.tokenOut === "USDC") {
    return lossUnits / 1e6;
  }
  return (lossUnits / 1e6) * (priceUsd ?? 1);
}

async function buildDefaultIngestHandler(config: Config): Promise<() => Promise<{ market: MarketSnapshot; wallet: WalletSnapshot }>> {
  const adapterBundle = createAdaptersWithCircuitBreaker({
    circuitBreakerConfig: {
      failureThreshold: config.circuitBreakerFailureThreshold,
      recoveryTimeMs: config.circuitBreakerRecoveryMs,
    },
    dexpaprika: { baseUrl: config.dexpaprikaBaseUrl, network: "solana" },
    moralis: { baseUrl: config.moralisBaseUrl, apiKey: config.moralisApiKey, chain: "solana" },
  });

  return createIngestHandler({
    dexpaprika: adapterBundle.dexpaprika,
    moralis: adapterBundle.moralis,
    walletAddress: config.walletAddress!,
    defaultTokenId: DEFAULT_LIVE_TOKEN_ID,
  } satisfies IngestAgentConfig);
}

function toCycleSummary(input: {
  cycleTimestamp: string;
  traceId: string;
  mode: "live";
  outcome: "success" | "blocked" | "error";
  intakeOutcome: "ok" | "stale" | "adapter_error" | "invalid" | "kill_switch_halted";
  stage: string;
  blocked: boolean;
  blockedReason?: string;
  decisionOccurred: boolean;
  signalOccurred: boolean;
  riskOccurred: boolean;
  chaosOccurred?: boolean;
  executionOccurred: boolean;
  verificationOccurred: boolean;
  errorOccurred: boolean;
  error?: string;
  decision?: RuntimeCycleSummary["decision"];
  decisionEnvelope?: import("../core/contracts/decision-envelope.js").DecisionEnvelope;
  tradeIntentId?: string;
  execution?: RuntimeCycleSummary["execution"];
  verification?: RuntimeCycleSummary["verification"];
  incidentIds: string[];
}): RuntimeCycleSummary {
  return {
    cycleTimestamp: input.cycleTimestamp,
    traceId: input.traceId,
    mode: input.mode,
    outcome: input.outcome,
    intakeOutcome: input.intakeOutcome,
    advanced: input.stage !== "ingest",
    stage: input.stage,
    blocked: input.blocked,
    blockedReason: input.blockedReason,
    decisionOccurred: input.decisionOccurred,
    signalOccurred: input.signalOccurred,
    riskOccurred: input.riskOccurred,
    chaosOccurred: input.chaosOccurred ?? false,
    executionOccurred: input.executionOccurred,
    verificationOccurred: input.verificationOccurred,
    paperExecutionProduced: false,
    errorOccurred: input.errorOccurred,
    error: input.error,
    decision: input.decision,
    decisionEnvelope: input.decisionEnvelope,
    tradeIntentId: input.tradeIntentId,
    execution: input.execution,
    verification: input.verification,
    incidentIds: input.incidentIds,
  };
}

export async function createLiveRuntime(config: Config, runtimeDeps: LiveRuntimeDeps = {}): Promise<LiveRuntime> {
  assertRuntimePolicyAuthority(config);
  assertLiveTradingPrerequisites(config);

  const defaults = createDefaultSafetyRepos(config);
  const killSwitchRepository = runtimeDeps.killSwitchRepository ?? defaults.killSwitchRepository;
  const liveControlRepository = runtimeDeps.liveControlRepository ?? defaults.liveControlRepository;
  const dailyLossRepository = runtimeDeps.dailyLossRepository ?? defaults.dailyLossRepository;
  const idempotencyRepository = runtimeDeps.idempotencyRepository ?? defaults.idempotencyRepository;

  assertRepositoryKind("kill-switch", killSwitchRepository);
  assertRepositoryKind("live-control", liveControlRepository);
  assertRepositoryKind("daily-loss", dailyLossRepository);
  assertRepositoryKind("idempotency", idempotencyRepository);

  const loadedKillSwitch = loadOrThrow(await killSwitchRepository.load(), "kill-switch");
  const loadedLiveControl = loadOrThrow(await liveControlRepository.load(), "live-control");
  const loadedDailyLoss = loadOrThrow(await dailyLossRepository.load(), "daily-loss");
  const loadedIdempotency = loadOrThrow(await idempotencyRepository.load(), "idempotency");

  configureKillSwitchRepository(killSwitchRepository);
  configureLiveControlRepository(liveControlRepository);
  configureDailyLossRepository(dailyLossRepository);
  hydrateKillSwitchState(loadedKillSwitch);
  hydrateLiveControlState(loadedLiveControl);
  hydrateDailyLossState(loadedDailyLoss);
  await idempotencyRepository.save(loadedIdempotency);

  const journalWriter =
    runtimeDeps.journalWriter ?? new FileSystemJournalWriter(config.journalPath, { autoStartPeriodicFlush: false });
  const incidentRecorder =
    runtimeDeps.incidentRecorder ??
    new RepositoryIncidentRecorder(
      new FileSystemIncidentRepository(`${derivePersistenceBasePath(config)}.incidents.jsonl`)
    );
  const cycleSummaryWriter =
    runtimeDeps.cycleSummaryWriter ??
    new FileSystemRuntimeCycleSummaryWriter(`${derivePersistenceBasePath(config)}.runtime-cycles.jsonl`);
  const executionEvidenceRepository =
    runtimeDeps.executionEvidenceRepository ??
    new FileSystemExecutionRepository(`${derivePersistenceBasePath(config)}.execution-evidence.jsonl`);
  const ingestHandler = runtimeDeps.ingestHandler ?? (await buildDefaultIngestHandler(config));
  const rpcClient = runtimeDeps.rpcClient ?? createRpcClient({ rpcUrl: config.rpcUrl });
  const signer = runtimeDeps.signer ?? createSignerFromConfig(config);
  const executionHandlerFactory = runtimeDeps.executionHandlerFactory ?? createExecutionHandler;
  const executionHandler = await executionHandlerFactory({
    rpcClient,
    walletAddress: config.walletAddress,
    signer,
    buildSwapTransaction: runtimeDeps.buildSwapTransaction,
    verifyTransaction: runtimeDeps.verifyTransaction,
    executionEvidenceRepository,
    incidentRecorder,
  });

  const clock = runtimeDeps.clock ?? new SystemClock();
  const decisionCoordinator = runtimeDeps.decisionCoordinator ?? createCanonicalDecisionAuthority();
  const engine =
    runtimeDeps.engine ??
    new Engine({
      clock,
      dryRun: false,
      executionMode: "live",
      decisionCoordinator,
      journalWriter,
      journalPolicy: "mandatory",
      dailyLossTracker: createDailyLossTracker(clock),
    });

  return new LiveRuntime(config, {
    ingestHandler,
    executionHandler,
    engine,
    journalWriter,
    incidentRecorder,
    cycleSummaryWriter,
    executionEvidenceRepository,
    killSwitchRepository,
    liveControlRepository,
    dailyLossRepository,
    idempotencyRepository,
    clock,
    decisionCoordinator,
    logger: runtimeDeps.logger ?? console,
    loopIntervalMs: runtimeDeps.loopIntervalMs ?? 15_000,
  });
}

export class LiveRuntime implements RuntimeController {
  private readonly clock: Clock;
  private readonly engine: Engine;
  private readonly decisionCoordinator: DecisionCoordinator;
  private readonly runtimeConfigManager?: RuntimeConfigManager;
  private intervalRef: NodeJS.Timeout | null = null;
  private status: RuntimeStatus = "idle";
  private cycleInFlight = false;
  private lastState: EngineState | null = null;
  private lastCycleAt?: string;
  private lastDecisionAt?: string;
  private lastCycleSummary?: RuntimeCycleSummary;
  private readonly recentCycleSummaries: RuntimeCycleSummary[] = [];
  private readonly recentIncidents: IncidentRecord[] = [];
  private counters = {
    cycleCount: 0,
    decisionCount: 0,
    executionCount: 0,
    blockedCount: 0,
    errorCount: 0,
  };

  constructor(
    private readonly config: Config,
    private readonly deps: LiveRuntimeResolvedDeps
  ) {
    this.clock = deps.clock;
    this.engine = deps.engine;
    this.decisionCoordinator = deps.decisionCoordinator;
    this.runtimeConfigManager = deps.runtimeConfigManager;
  }

  async start(): Promise<void> {
    if (this.status === "running") {
      return;
    }

    this.status = "running";
    if (this.config.liveTestMode) {
      const preflight = preflightLiveTestRound("runtime_start");
      if (!preflight.success) {
        this.status = "error";
        throw new Error(preflight.message);
      }
      const liveStart = startLiveTestRound("runtime_start");
      if (!liveStart.success) {
        this.status = "error";
        throw new Error(liveStart.message);
      }
    }

    await this.runCycle({ propagateError: true });
    this.intervalRef = setInterval(() => {
      void this.runCycle();
    }, this.deps.loopIntervalMs);
  }

  async stop(): Promise<void> {
    if (this.intervalRef) {
      clearInterval(this.intervalRef);
      this.intervalRef = null;
    }
    if (this.config.liveTestMode) {
      completeLiveTestRound("runtime_stop", "runtime_stop");
    }
    this.status = "stopped";
  }

  async emergencyStop(reason = "operator_emergency_stop"): Promise<RuntimeControlResult> {
    this.status = "paused";
    if (this.config.liveTestMode) {
      stopLiveTestRound(reason, "api_emergency_stop");
    }
    if (this.runtimeConfigManager) {
      const mutation = await this.runtimeConfigManager.setKillSwitch({
        action: "trigger",
        actor: "runtime",
        reason,
      });
      if (!mutation.accepted) {
        return {
          success: false,
          status: this.status,
          message: mutation.rejectionReason ?? mutation.message,
        };
      }
    } else {
      triggerKillSwitch(reason);
    }
    await this.recordIncident({
      severity: "critical",
      type: "emergency_stop",
      message: "Emergency stop activated",
      details: { reason, liveControlPosture: getMicroLiveControlSnapshot().posture },
    });
    return {
      success: true,
      status: this.status,
      message: "Emergency stop activated; runtime paused.",
    };
  }

  async pause(reason = "operator_pause"): Promise<RuntimeControlResult> {
    if (this.status === "stopped" || this.status === "error") {
      return {
        success: false,
        status: this.status,
        message: `Pause unsupported while runtime status=${this.status}`,
      };
    }
    this.status = "paused";
    await this.recordIncident({
      severity: "warning",
      type: "runtime_paused",
      message: "Runtime paused by control plane",
      details: { reason },
    });
    return { success: true, status: this.status, message: "Runtime paused." };
  }

  async resume(reason = "operator_resume"): Promise<RuntimeControlResult> {
    if (isKillSwitchHalted()) {
      return { success: false, status: this.status, message: "Resume blocked: kill switch is active." };
    }
    if (this.status !== "paused") {
      return {
        success: false,
        status: this.status,
        message: `Resume unsupported while runtime status=${this.status}`,
      };
    }
    if (this.config.liveTestMode) {
      const liveStart = startLiveTestRound("api_resume");
      if (!liveStart.success) {
        return { success: false, status: this.status, message: liveStart.message };
      }
    }
    this.status = "running";
    if (!this.intervalRef) {
      this.intervalRef = setInterval(() => {
        void this.runCycle();
      }, this.deps.loopIntervalMs);
    }
    await this.recordIncident({
      severity: "info",
      type: "runtime_resumed",
      message: "Runtime resumed by control plane",
      details: { reason },
    });
    await this.runCycle();
    return { success: true, status: this.status, message: "Runtime resumed." };
  }

  async halt(reason = "operator_halt"): Promise<RuntimeControlResult> {
    if (this.intervalRef) {
      clearInterval(this.intervalRef);
      this.intervalRef = null;
    }
    if (this.config.liveTestMode) {
      completeLiveTestRound(reason, "api_halt");
    }
    this.status = "stopped";
    await this.recordIncident({
      severity: "critical",
      type: "runtime_halted",
      message: "Runtime halted by control plane",
      details: { reason },
    });
    return { success: true, status: this.status, message: "Runtime halted." };
  }

  async armLive(reason = "operator_arm"): Promise<RuntimeControlResult> {
    const control = armMicroLive(reason);
    await this.recordIncident({
      severity: control.success ? "info" : "warning",
      type: "live_control_armed",
      message: control.message,
      details: { reason, liveControlPosture: control.snapshot.posture },
    });
    return { success: control.success, status: this.status, message: control.message };
  }

  async disarmLive(reason = "operator_disarm"): Promise<RuntimeControlResult> {
    const control = disarmMicroLive(reason);
    await this.recordIncident({
      severity: "warning",
      type: "live_control_disarmed",
      message: control.message,
      details: { reason, liveControlPosture: control.snapshot.posture },
    });
    return { success: true, status: this.status, message: control.message };
  }

  async resetLiveKill(reason = "operator_reset_kill"): Promise<RuntimeControlResult> {
    const control = this.config.liveTestMode ? resetLiveTestRound(reason) : resetKilledMicroLive(reason);
    if (this.runtimeConfigManager) {
      const mutation = await this.runtimeConfigManager.setKillSwitch({
        action: "reset",
        actor: "runtime",
        reason,
      });
      if (!mutation.accepted) {
        return {
          success: false,
          status: this.status,
          message: mutation.rejectionReason ?? mutation.message,
        };
      }
    } else {
      resetKillSwitch();
    }
    await this.recordIncident({
      severity: "info",
      type: "live_control_disarmed",
      message: control.message,
      details: { reason, liveControlPosture: control.snapshot.posture },
    });
    return { success: control.success, status: this.status, message: control.message };
  }

  getStatus(): RuntimeStatus {
    return this.status;
  }

  getSnapshot(): RuntimeSnapshot {
    return {
      status: this.status,
      mode: "live",
      paperModeActive: false,
      cycleInFlight: this.cycleInFlight,
      liveControl: getMicroLiveControlSnapshot(),
      runtimeConfig: this.runtimeConfigManager?.getRuntimeConfigStatus(),
      counters: { ...this.counters },
      lastCycleAt: this.lastCycleAt,
      lastDecisionAt: this.lastDecisionAt,
      lastState: this.lastState,
      lastCycleSummary: this.lastCycleSummary,
    };
  }

  async listRecentCycleSummaries(limit = 50): Promise<RuntimeCycleSummary[]> {
    return this.deps.cycleSummaryWriter.list(limit);
  }

  async listRecentIncidents(limit = 50): Promise<IncidentRecord[]> {
    return this.deps.incidentRecorder.list(limit);
  }

  async getCycleReplay(traceId: string): Promise<{
    traceId: string;
    summary: RuntimeCycleSummary;
    incidents: IncidentRecord[];
    journal: import("../core/contracts/journal.js").JournalEntry[];
  } | null> {
    const summary = await this.deps.cycleSummaryWriter.getByTraceId(traceId);
    if (!summary) {
      return null;
    }

    const [incidents, journal] = await Promise.all([
      this.deps.incidentRecorder.listByTraceId(traceId),
      this.deps.journalWriter.getByTraceId(traceId),
    ]);

    return { traceId, summary, incidents, journal };
  }

  private async runCycle(options: { propagateError?: boolean } = {}): Promise<void> {
    if (this.cycleInFlight || this.status !== "running") {
      return;
    }

    this.cycleInFlight = true;
    let currentCycleTimestamp = this.clock.now().toISOString();
    let currentCycleTraceId = `runtime-${currentCycleTimestamp}`;
    let currentCycleIntakeOutcome: "ok" | "stale" | "adapter_error" | "invalid" | "kill_switch_halted" = "invalid";

    try {
      await this.runtimeConfigManager?.refresh();

      if (isKillSwitchHalted()) {
        this.status = "paused";
        this.lastState = {
          stage: "risk",
          traceId: currentCycleTraceId,
          timestamp: currentCycleTimestamp,
          blocked: true,
          blockedReason: "RUNTIME_PHASE2_KILL_SWITCH_HALTED",
        };
        this.counters.blockedCount += 1;
        const incident = await this.recordIncident({
          severity: "critical",
          type: "runtime_paused",
          message: "Runtime paused because kill switch is active",
          details: { reason: "kill_switch_halted", traceId: currentCycleTraceId },
        });
        await this.persistCycleSummary(
          toCycleSummary({
            cycleTimestamp: currentCycleTimestamp,
            traceId: currentCycleTraceId,
            mode: "live",
            outcome: "blocked",
            intakeOutcome: "kill_switch_halted",
            stage: "risk",
            blocked: true,
            blockedReason: "RUNTIME_PHASE2_KILL_SWITCH_HALTED",
            decisionOccurred: false,
            signalOccurred: false,
            riskOccurred: false,
            executionOccurred: false,
            verificationOccurred: false,
            errorOccurred: false,
            incidentIds: [incident.id],
          })
        );
        return;
      }

      this.runtimeConfigManager?.beginCycle();
      currentCycleTimestamp = this.clock.now().toISOString();
      currentCycleTraceId = `runtime-${currentCycleTimestamp}`;
      this.counters.cycleCount += 1;
      this.lastCycleAt = currentCycleTimestamp;

      let cycleMarket: MarketSnapshot | undefined;
      let cycleWallet: WalletSnapshot | undefined;

      const executeWithIdempotency = async (intent: TradeIntent): Promise<ExecutionReport> => {
        if (this.deps.idempotencyRepository.hasSync(intent.idempotencyKey)) {
          return {
            traceId: intent.traceId,
            timestamp: intent.timestamp,
            tradeIntentId: intent.idempotencyKey,
            success: false,
            error: "Duplicate idempotency key rejected",
            dryRun: false,
            executionMode: "live",
            failClosed: true,
            failureStage: "execution",
            failureCode: "IDEMPOTENCY_REPLAY_BLOCK",
          };
        }
        this.deps.idempotencyRepository.putSync(intent.idempotencyKey, {
          status: "pending",
          traceId: intent.traceId,
        });
        const report = await this.deps.executionHandler(intent);
        if (report.success) {
          this.counters.executionCount += 1;
          recordTrade(estimateLossUsd(intent, report, cycleMarket?.priceUsd));
        }
        this.deps.idempotencyRepository.putSync(intent.idempotencyKey, {
          status: report.success ? "completed" : "failed",
          traceId: intent.traceId,
          failureCode: report.failureCode,
        });
        return report;
      };

      this.lastState = await this.engine.run(
        async () => {
          const intake = await this.deps.ingestHandler();
          cycleMarket = intake.market;
          cycleWallet = intake.wallet;
          const tid = intake.market.traceId || intake.wallet.traceId || currentCycleTraceId;
          currentCycleTraceId = tid;
          currentCycleIntakeOutcome = "ok";
          return intake;
        },
        async (market) => {
          const traceId = market.traceId || cycleWallet?.traceId || currentCycleTraceId;
          const signalPack = buildSignalPack(market, traceId, currentCycleTimestamp);
          const scoreCard = runScoringEngine({ signalPack, traceId, timestamp: currentCycleTimestamp });
          const patternResult = recognizePatterns(traceId, currentCycleTimestamp, scoreCard, signalPack);
          const out = runSignalEngine({
            market,
            scoreCard,
            patternResult,
            dataQuality: signalPack.dataQuality,
            traceId,
            timestamp: currentCycleTimestamp,
            dryRun: false,
            executionMode: "live",
          });
          if (out.blocked) {
            return { blocked: true, blockedReason: out.reason };
          }
          return {
            direction: out.intent.tokenOut === "USDC" ? "buy" : "hold",
            confidence: scoreCard.hybrid,
            intent: { ...out.intent, executionMode: "live", dryRun: false },
          };
        },
        async (intent, market, wallet) => {
          const signalPack = buildSignalPack(market, intent.traceId, intent.timestamp);
          const scoreCard = runScoringEngine({
            signalPack,
            traceId: intent.traceId,
            timestamp: intent.timestamp,
          });
          const patternResult = recognizePatterns(intent.traceId, intent.timestamp, scoreCard, signalPack);
          return runRiskEngine({
            traceId: intent.traceId,
            timestamp: intent.timestamp,
            liquidity: market.liquidity,
            socialManip: patternResult.patterns.length > 0 ? 0.35 : 0.05,
            momentumExhaust: Math.max(0, Math.min(1, 1 - scoreCard.hybrid)),
            structuralWeakness: wallet.balances.length === 0 ? 0.4 : 0.05,
          });
        },
        executeWithIdempotency,
        async (intent, report) => {
          if (!report.success) {
            return {
              traceId: intent.traceId,
              timestamp: intent.timestamp,
              passed: false,
              checks: {},
              reason: report.error,
              verificationMode: "rpc",
            };
          }
          return {
            traceId: intent.traceId,
            timestamp: intent.timestamp,
            passed: true,
            checks: {},
            verificationMode: "rpc",
          };
        }
      );

      currentCycleTraceId = this.lastState.traceId;
      this.lastDecisionAt = currentCycleTimestamp;
      this.counters.decisionCount += 1;

      const env = this.lastState.decisionEnvelope;
      const intent = this.lastState.tradeIntent;
      const report = this.lastState.executionReport;

      if (this.lastState.blocked) {
        this.counters.blockedCount += 1;
      }

      if (report && !report.success) {
        await this.recordIncident({
          severity: "critical",
          type: "live_execution_refused",
          message: report.error ?? "Live execution failed",
          details: {
            traceId: this.lastState.traceId,
            tradeIntentId: intent?.idempotencyKey,
            failureStage: report.failureStage ?? null,
            failureCode: report.failureCode ?? null,
          },
        });
      }

      const summary = toCycleSummary({
        cycleTimestamp: currentCycleTimestamp,
        traceId: this.lastState.traceId,
        mode: "live",
        outcome:
          this.lastState.error !== undefined
            ? "error"
            : this.lastState.blocked
              ? "blocked"
              : "success",
        intakeOutcome: currentCycleIntakeOutcome,
        stage: this.lastState.stage,
        blocked: this.lastState.blocked === true,
        blockedReason: this.lastState.blockedReason,
        decisionEnvelope: env,
        decisionOccurred: intent !== undefined,
        signalOccurred: this.lastState.signal !== undefined,
        riskOccurred: this.lastState.riskAllowed !== undefined,
        chaosOccurred: this.lastState.chaosAllowed !== undefined,
        executionOccurred: report !== undefined,
        verificationOccurred: this.lastState.rpcVerification !== undefined,
        errorOccurred: this.lastState.error !== undefined,
        error: this.lastState.error,
        decision: intent
          ? {
              allowed: this.lastState.blocked !== true,
              direction: intent.tokenOut === "USDC" ? "buy" : "hold",
              confidence: this.lastState.signal?.confidence,
              riskAllowed: this.lastState.riskAllowed,
              chaosAllowed: this.lastState.chaosAllowed,
              reason: this.lastState.blockedReason ?? this.lastState.error,
              tradeIntentId: intent.idempotencyKey,
            }
          : undefined,
        tradeIntentId: intent?.idempotencyKey,
        execution: report
          ? {
              success: report.success,
              mode: report.executionMode,
              paperExecution: report.paperExecution,
              actualAmountOut: report.actualAmountOut,
              error: report.error,
            }
          : undefined,
        verification: this.lastState.rpcVerification
          ? {
              passed: this.lastState.rpcVerification.passed,
              mode: this.lastState.rpcVerification.verificationMode,
              reason: this.lastState.rpcVerification.reason,
            }
          : undefined,
        incidentIds: [],
      });

      this.lastCycleSummary = summary;
      this.recentCycleSummaries.push({ ...summary, incidentIds: [...summary.incidentIds] });
      while (this.recentCycleSummaries.length > RECENT_CYCLE_LIMIT) {
        this.recentCycleSummaries.shift();
      }
      await this.deps.cycleSummaryWriter.append(summary);
    } catch (error) {
      this.status = "error";
      this.counters.errorCount += 1;
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.lastState = {
        stage: "ingest",
        traceId: currentCycleTraceId,
        timestamp: currentCycleTimestamp,
        blocked: true,
        blockedReason: "RUNTIME_CYCLE_ERROR",
        error: errorMessage,
      };
      const incident = await this.recordIncident({
        severity: "critical",
        type: "runtime_cycle_error",
        message: "Runtime cycle failed",
        details: { error: errorMessage, traceId: currentCycleTraceId },
      });
      await this.persistCycleSummary(
        toCycleSummary({
          cycleTimestamp: currentCycleTimestamp,
          traceId: currentCycleTraceId,
          mode: "live",
          outcome: "error",
          intakeOutcome: currentCycleIntakeOutcome,
          stage: "ingest",
          blocked: true,
          blockedReason: "RUNTIME_CYCLE_ERROR",
          decisionOccurred: false,
          signalOccurred: false,
          riskOccurred: false,
          executionOccurred: false,
          verificationOccurred: false,
          errorOccurred: true,
          error: errorMessage,
          incidentIds: [incident.id],
        })
      );
      if (this.intervalRef) {
        clearInterval(this.intervalRef);
        this.intervalRef = null;
      }
      if (options.propagateError) {
        throw error instanceof Error ? error : new Error(String(error));
      }
    } finally {
      await this.runtimeConfigManager?.endCycle();
      this.cycleInFlight = false;
    }
  }

  private async recordIncident(input: {
    severity: IncidentRecord["severity"];
    type: IncidentRecord["type"];
    message: string;
    details?: IncidentRecord["details"];
  }): Promise<IncidentRecord> {
    const record = await this.deps.incidentRecorder.record(input);
    this.recentIncidents.push({ ...record, details: record.details ? { ...record.details } : undefined });
    while (this.recentIncidents.length > RECENT_INCIDENT_LIMIT) {
      this.recentIncidents.shift();
    }
    return record;
  }

  private async persistCycleSummary(summary: RuntimeCycleSummary): Promise<void> {
    this.lastCycleSummary = summary;
    this.recentCycleSummaries.push({ ...summary, incidentIds: [...summary.incidentIds] });
    while (this.recentCycleSummaries.length > RECENT_CYCLE_LIMIT) {
      this.recentCycleSummaries.shift();
    }
    await this.deps.cycleSummaryWriter.append(summary);
  }
}
