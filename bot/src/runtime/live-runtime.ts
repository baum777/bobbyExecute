import type { Config } from "../config/config-schema.js";
import type { RuntimeConfigManager } from "./runtime-config-manager.js";
import type { Clock } from "../core/clock.js";
import { SystemClock } from "../core/clock.js";
import type { MarketSnapshot } from "../core/contracts/market.js";
import type { WalletSnapshot } from "../core/contracts/wallet.js";
import type { SignalPack } from "../core/contracts/signalpack.js";
import type { TradeIntent, ExecutionReport } from "../core/contracts/trade.js";
import type { EngineState } from "../core/engine.js";
import type { JournalWriter } from "../journal-writer/writer.js";
import { FileSystemJournalWriter } from "../journal-writer/writer.js";
import { createTraceId } from "../observability/trace-id.js";
import { RepositoryIncidentRecorder, type IncidentRecorder } from "../observability/incidents.js";
import type { IncidentRecord, IncidentRepository } from "../persistence/incident-repository.js";
import { FileSystemIncidentRepository } from "../persistence/incident-repository.js";
import { appendJournal } from "../persistence/journal-repository.js";
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
  clock?: Clock;
  decisionCoordinator?: DecisionCoordinator;
  runtimeConfigManager?: RuntimeConfigManager;
  rpcClient?: RpcClient;
  signTransaction?: ExecutionHandlerDeps["signTransaction"];
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
  executionOccurred: boolean;
  verificationOccurred: boolean;
  errorOccurred: boolean;
  error?: string;
  decision?: RuntimeCycleSummary["decision"];
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
    chaosOccurred: false,
    executionOccurred: input.executionOccurred,
    verificationOccurred: input.verificationOccurred,
    paperExecutionProduced: false,
    errorOccurred: input.errorOccurred,
    error: input.error,
    decision: input.decision,
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
  const executionHandlerFactory = runtimeDeps.executionHandlerFactory ?? createExecutionHandler;
  if (executionHandlerFactory === createExecutionHandler) {
    if (!runtimeDeps.signTransaction || !rpcClient.sendRawTransaction) {
      throw new Error("LIVE_BOOT_ABORTED_EXECUTION_SIGNER_UNAVAILABLE");
    }
  }
  const executionHandler = await executionHandlerFactory({
    rpcClient,
    walletAddress: config.walletAddress,
    signTransaction: runtimeDeps.signTransaction,
    buildSwapTransaction: runtimeDeps.buildSwapTransaction,
    verifyTransaction: runtimeDeps.verifyTransaction,
    executionEvidenceRepository,
    incidentRecorder,
  });

  return new LiveRuntime(config, {
    ingestHandler,
    executionHandler,
    journalWriter,
    incidentRecorder,
    cycleSummaryWriter,
    executionEvidenceRepository,
    killSwitchRepository,
    liveControlRepository,
    dailyLossRepository,
    idempotencyRepository,
    clock: runtimeDeps.clock ?? new SystemClock(),
    decisionCoordinator: runtimeDeps.decisionCoordinator ?? createCanonicalDecisionAuthority(),
    logger: runtimeDeps.logger ?? console,
    loopIntervalMs: runtimeDeps.loopIntervalMs ?? 15_000,
  });
}

export class LiveRuntime implements RuntimeController {
  private readonly clock: Clock;
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

      const intake = await this.deps.ingestHandler();
      const market = intake.market;
      const wallet = intake.wallet;
      const traceId = market.traceId || wallet.traceId || currentCycleTraceId;
      currentCycleTraceId = traceId;
      currentCycleIntakeOutcome = "ok";

      const signalPack = buildSignalPack(market, traceId, currentCycleTimestamp);
      const scoreCard = runScoringEngine({ signalPack, traceId, timestamp: currentCycleTimestamp });
      const patternResult = recognizePatterns(traceId, currentCycleTimestamp, scoreCard, signalPack);
      const riskDecision = runRiskEngine({
        traceId,
        timestamp: currentCycleTimestamp,
        liquidity: market.liquidity,
        socialManip: patternResult.patterns.length > 0 ? 0.35 : 0.05,
        momentumExhaust: Math.max(0, Math.min(1, 1 - scoreCard.hybrid)),
        structuralWeakness: wallet.balances.length === 0 ? 0.4 : 0.05,
      });

      if (!riskDecision.allowed) {
        const incident = await this.recordIncident({
          severity: "warning",
          type: "live_execution_refused",
          message: riskDecision.reason ?? "Risk gate refused execution",
          details: { traceId, reason: riskDecision.reason ?? "risk_gate_refused" },
        });
        this.counters.blockedCount += 1;
        this.lastState = {
          stage: "risk",
          traceId,
          timestamp: currentCycleTimestamp,
          blocked: true,
          blockedReason: riskDecision.reason ?? "Risk gate refused execution",
          market,
          wallet,
          signal: { direction: "hold", confidence: 0 },
        };
        await this.persistCycleSummary(
          toCycleSummary({
            cycleTimestamp: currentCycleTimestamp,
            traceId,
            mode: "live",
            outcome: "blocked",
            intakeOutcome: currentCycleIntakeOutcome,
            stage: "risk",
            blocked: true,
            blockedReason: riskDecision.reason ?? "Risk gate refused execution",
            decisionOccurred: true,
            signalOccurred: true,
            riskOccurred: true,
            executionOccurred: false,
            verificationOccurred: false,
            errorOccurred: false,
            decision: {
              allowed: false,
              direction: "hold",
              confidence: 0,
              riskAllowed: false,
              reason: riskDecision.reason,
            },
            incidentIds: [incident.id],
          })
        );
        return;
      }

      const signalOutput = runSignalEngine({
        market,
        scoreCard,
        patternResult,
        dataQuality: signalPack.dataQuality,
        traceId,
        timestamp: currentCycleTimestamp,
        dryRun: false,
        executionMode: "live",
      });

      if (signalOutput.blocked) {
        const incident = await this.recordIncident({
          severity: "warning",
          type: "live_execution_refused",
          message: signalOutput.reason,
          details: { traceId, reason: signalOutput.reason },
        });
        this.counters.blockedCount += 1;
        this.lastState = {
          stage: "signal",
          traceId,
          timestamp: currentCycleTimestamp,
          blocked: true,
          blockedReason: signalOutput.reason,
          market,
          wallet,
        };
        await this.persistCycleSummary(
          toCycleSummary({
            cycleTimestamp: currentCycleTimestamp,
            traceId,
            mode: "live",
            outcome: "blocked",
            intakeOutcome: currentCycleIntakeOutcome,
            stage: "signal",
            blocked: true,
            blockedReason: signalOutput.reason,
            decisionOccurred: true,
            signalOccurred: true,
            riskOccurred: true,
            executionOccurred: false,
            verificationOccurred: false,
            errorOccurred: false,
            decision: {
              allowed: false,
              direction: "hold",
              confidence: 0,
              riskAllowed: riskDecision.allowed,
              reason: signalOutput.reason,
            },
            incidentIds: [incident.id],
          })
        );
        return;
      }

      const intent: TradeIntent = {
        ...signalOutput.intent,
        executionMode: "live",
        dryRun: false,
      };
      this.lastDecisionAt = currentCycleTimestamp;
      this.counters.decisionCount += 1;

      const liveControl = getMicroLiveControlSnapshot();
      if (liveControl.posture !== "live_armed" || liveControl.blocked || liveControl.killSwitchActive) {
        const incident = await this.recordIncident({
          severity: "warning",
          type: "live_guardrail_refused",
          message: liveControl.reasonDetail ?? "Live control posture is not armed",
          details: {
            traceId,
            posture: liveControl.posture,
            reasonCode: liveControl.reasonCode,
          },
        });
        this.counters.blockedCount += 1;
        this.lastState = {
          stage: "risk",
          traceId,
          timestamp: currentCycleTimestamp,
          blocked: true,
          blockedReason: liveControl.reasonDetail ?? "Live control posture is not armed",
          market,
          wallet,
          signal: { direction: "buy", confidence: 0.5 },
          tradeIntent: intent,
        };
        await this.persistCycleSummary(
          toCycleSummary({
            cycleTimestamp: currentCycleTimestamp,
            traceId,
            mode: "live",
            outcome: "blocked",
            intakeOutcome: currentCycleIntakeOutcome,
            stage: "risk",
            blocked: true,
            blockedReason: liveControl.reasonDetail ?? "Live control posture is not armed",
            decisionOccurred: true,
            signalOccurred: true,
            riskOccurred: true,
            executionOccurred: false,
            verificationOccurred: false,
            errorOccurred: false,
            decision: {
              allowed: false,
              direction: intent.tokenOut === "USDC" ? "buy" : "hold",
              confidence: 0.5,
              riskAllowed: riskDecision.allowed,
              reason: liveControl.reasonDetail ?? "Live control posture is not armed",
              tradeIntentId: intent.idempotencyKey,
            },
            tradeIntentId: intent.idempotencyKey,
            incidentIds: [incident.id],
          })
        );
        return;
      }

      if (this.deps.idempotencyRepository.hasSync(intent.idempotencyKey)) {
        const incident = await this.recordIncident({
          severity: "warning",
          type: "live_execution_refused",
          message: "Duplicate idempotency key rejected",
          details: { traceId, tradeIntentId: intent.idempotencyKey },
        });
        this.counters.blockedCount += 1;
        await this.persistCycleSummary(
          toCycleSummary({
            cycleTimestamp: currentCycleTimestamp,
            traceId,
            mode: "live",
            outcome: "blocked",
            intakeOutcome: currentCycleIntakeOutcome,
            stage: "execution",
            blocked: true,
            blockedReason: "IDEMPOTENCY_REPLAY_BLOCK",
            decisionOccurred: true,
            signalOccurred: true,
            riskOccurred: true,
            executionOccurred: false,
            verificationOccurred: false,
            errorOccurred: false,
            decision: {
              allowed: false,
              direction: intent.tokenOut === "USDC" ? "buy" : "hold",
              confidence: 0.5,
              riskAllowed: riskDecision.allowed,
              reason: "Duplicate idempotency key rejected",
              tradeIntentId: intent.idempotencyKey,
            },
            tradeIntentId: intent.idempotencyKey,
            incidentIds: [incident.id],
          })
        );
        return;
      }

      this.deps.idempotencyRepository.putSync(intent.idempotencyKey, {
        status: "pending",
        traceId,
      });

      const report = await this.deps.executionHandler(intent);
      if (report.success) {
        this.counters.executionCount += 1;
        recordTrade(estimateLossUsd(intent, report, market.priceUsd));
      }

      const journalEntry = {
        traceId,
        timestamp: currentCycleTimestamp,
        stage: "live_cycle",
        input: { market, wallet, signalPack, intent },
        output: { report },
        blocked: !report.success,
        reason: report.error,
      };
      await appendJournal(this.deps.journalWriter, journalEntry);

      this.lastState = {
        stage: report.success ? "journal" : report.failureStage === "verification" ? "verify" : "execute",
        traceId,
        timestamp: currentCycleTimestamp,
        market,
        wallet,
        signal: { direction: intent.tokenOut === "USDC" ? "buy" : "hold", confidence: scoreCard.hybrid },
        tradeIntent: intent,
        riskAllowed: riskDecision.allowed,
        executionReport: report,
        blocked: !report.success,
        blockedReason: report.success ? undefined : report.error,
        error: report.success ? undefined : report.error,
      };

      if (!report.success) {
        this.counters.blockedCount += 1;
        await this.recordIncident({
          severity: "critical",
          type: "live_execution_refused",
          message: report.error ?? "Live execution failed",
          details: {
            traceId,
            tradeIntentId: intent.idempotencyKey,
            failureStage: report.failureStage ?? null,
            failureCode: report.failureCode ?? null,
          },
        });
      }

      this.deps.idempotencyRepository.putSync(intent.idempotencyKey, {
        status: report.success ? "completed" : "failed",
        traceId,
        failureCode: report.failureCode,
      });

      const summary = toCycleSummary({
        cycleTimestamp: currentCycleTimestamp,
        traceId,
        mode: "live",
        outcome: report.success ? "success" : "blocked",
        intakeOutcome: currentCycleIntakeOutcome,
        stage: report.success ? "journal" : report.failureStage ?? "execution",
        blocked: !report.success,
        blockedReason: report.success ? undefined : report.error,
        decisionOccurred: true,
        signalOccurred: true,
        riskOccurred: true,
        executionOccurred: true,
        verificationOccurred: Boolean(report.success || report.failureStage === "verification"),
        errorOccurred: !report.success,
        error: report.success ? undefined : report.error,
        decision: {
          allowed: report.success,
          direction: intent.tokenOut === "USDC" ? "buy" : "hold",
          confidence: scoreCard.hybrid,
          riskAllowed: riskDecision.allowed,
          reason: report.success ? undefined : report.error,
          tradeIntentId: intent.idempotencyKey,
        },
        tradeIntentId: intent.idempotencyKey,
        execution: {
          success: report.success,
          mode: report.executionMode,
          paperExecution: report.paperExecution,
          actualAmountOut: report.actualAmountOut,
          error: report.error,
        },
        verification: {
          passed: report.success,
          mode: "rpc",
          reason: report.error,
        },
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
