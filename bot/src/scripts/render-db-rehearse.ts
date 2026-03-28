import { Pool } from "pg";
import { pathToFileURL } from "node:url";
import type { ControlGovernanceRepositoryWithAudits, ControlRecoveryRehearsalExecutionContext } from "../control/control-governance.js";
import type { ControlRecoveryRehearsalExecutionSource, ControlRecoveryRehearsalContext } from "../control/control-governance.js";
import type { DisposableDatabaseRehearsalActor, DisposableDatabaseRehearsalConfig, DisposableDatabaseRehearsalResult } from "../recovery/disposable-db-rehearsal.js";
import { runDisposableDatabaseRehearsal } from "../recovery/disposable-db-rehearsal.js";
import { PostgresControlGovernanceRepository } from "../persistence/control-governance-repository.js";
import type { SchemaMigrationConnection } from "../persistence/schema-migrations.js";
import { syncDatabaseRehearsalFreshnessState } from "../control/control-governance.js";
import { DatabaseRehearsalFreshnessNotificationService } from "../control/database-rehearsal-notification-service.js";
import { closePool, parseCliArgs, readCliString } from "./cli.js";

type RenderRehearsalConnection = SchemaMigrationConnection & { end(): Promise<unknown> };

export interface RenderDatabaseRehearsalRefreshConfig {
  sourceDatabaseUrl: string;
  targetDatabaseUrl: string;
  environment: string;
  sourceContextLabel: string;
  targetContextLabel: string;
  sourceContextKind: ControlRecoveryRehearsalContext["kind"];
  targetContextKind: ControlRecoveryRehearsalContext["kind"];
  renderServiceName: string;
  cronSchedule: string;
  executionSource: ControlRecoveryRehearsalExecutionSource;
  executionContext: ControlRecoveryRehearsalExecutionContext;
  actor: DisposableDatabaseRehearsalActor;
  migrationsDir?: string;
  rehearsalId?: string;
}

export interface RenderDatabaseRehearsalRefreshDependencies {
  openConnection?: (databaseUrl: string) => RenderRehearsalConnection;
  closeConnection?: (connection: RenderRehearsalConnection) => Promise<void>;
  buildEvidenceRepository?: (sourceConnection: RenderRehearsalConnection) => ControlGovernanceRepositoryWithAudits;
  runRehearsal?: (config: DisposableDatabaseRehearsalConfig) => Promise<DisposableDatabaseRehearsalResult>;
}

function trimOrThrow(value: string | undefined, name: string): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    throw new Error(`${name} is required.`);
  }
  return trimmed;
}

function requireExact(value: string, expected: string, name: string): string {
  if (value !== expected) {
    throw new Error(`${name} must be '${expected}'.`);
  }
  return value;
}

function buildContext(kind: ControlRecoveryRehearsalContext["kind"], label: string): ControlRecoveryRehearsalContext {
  return { kind, label };
}

function buildDefaultActor(renderServiceName: string): DisposableDatabaseRehearsalActor {
  return {
    actorId: `render-rehearsal-${renderServiceName}`,
    displayName: `Render rehearsal refresh (${renderServiceName})`,
    role: "admin",
    sessionId: `render:${renderServiceName}`,
  };
}

function validateRenderDatabaseRehearsalRefreshConfig(config: RenderDatabaseRehearsalRefreshConfig): void {
  trimOrThrow(config.sourceDatabaseUrl, "sourceDatabaseUrl");
  trimOrThrow(config.targetDatabaseUrl, "targetDatabaseUrl");
  trimOrThrow(config.environment, "environment");
  trimOrThrow(config.sourceContextLabel, "sourceContextLabel");
  trimOrThrow(config.targetContextLabel, "targetContextLabel");
  trimOrThrow(config.renderServiceName, "renderServiceName");
  trimOrThrow(config.cronSchedule, "cronSchedule");

  if (config.executionSource !== "automated") {
    throw new Error("executionSource must be 'automated' for the Render rehearsal refresh path.");
  }
  if (config.executionContext.orchestration !== "render_cron") {
    throw new Error("executionContext.orchestration must be 'render_cron' for the Render rehearsal refresh path.");
  }
  if (config.executionContext.provider !== "render") {
    throw new Error("executionContext.provider must be 'render' for the Render rehearsal refresh path.");
  }
  if (config.sourceContextKind !== "canonical") {
    throw new Error("sourceContextKind must be 'canonical'.");
  }
  if (config.targetContextKind !== "disposable") {
    throw new Error("targetContextKind must be 'disposable'.");
  }
  if (config.sourceDatabaseUrl.trim() === config.targetDatabaseUrl.trim()) {
    throw new Error("source and target database URLs are identical; refusing the Render rehearsal refresh.");
  }
}

export function parseRenderDatabaseRehearsalRefreshConfig(
  argv: string[] = process.argv.slice(2)
): RenderDatabaseRehearsalRefreshConfig {
  const args = parseCliArgs(argv);
  const executionSource = requireExact(
    readCliString(args, "execution-source", process.env.REHEARSAL_EXECUTION_SOURCE) ?? "",
    "automated",
    "REHEARSAL_EXECUTION_SOURCE"
  ) as ControlRecoveryRehearsalExecutionSource;
  const orchestrationMode = requireExact(
    readCliString(args, "orchestration-mode", process.env.REHEARSAL_ORCHESTRATION_MODE) ?? "",
    "render_cron",
    "REHEARSAL_ORCHESTRATION_MODE"
  );
  const automationProvider = requireExact(
    readCliString(args, "automation-provider", process.env.REHEARSAL_AUTOMATION_PROVIDER ?? "render") ?? "",
    "render",
    "REHEARSAL_AUTOMATION_PROVIDER"
  );
  const sourceDatabaseUrl = trimOrThrow(readCliString(args, "source-database-url", process.env.SOURCE_DATABASE_URL), "SOURCE_DATABASE_URL");
  const targetDatabaseUrl = trimOrThrow(readCliString(args, "target-database-url", process.env.TARGET_DATABASE_URL), "TARGET_DATABASE_URL");
  const environment = trimOrThrow(readCliString(args, "environment", process.env.RUNTIME_CONFIG_ENV ?? process.env.NODE_ENV), "environment");
  const sourceContextLabel = trimOrThrow(
    readCliString(args, "source-context", process.env.REHEARSAL_SOURCE_CONTEXT),
    "REHEARSAL_SOURCE_CONTEXT"
  );
  const targetContextLabel = trimOrThrow(
    readCliString(args, "target-context", process.env.REHEARSAL_TARGET_CONTEXT),
    "REHEARSAL_TARGET_CONTEXT"
  );
  const sourceContextKind = requireExact(
    readCliString(args, "source-kind", process.env.REHEARSAL_SOURCE_KIND ?? "canonical") ?? "",
    "canonical",
    "REHEARSAL_SOURCE_KIND"
  ) as ControlRecoveryRehearsalContext["kind"];
  const targetContextKind = requireExact(
    readCliString(args, "target-kind", process.env.REHEARSAL_TARGET_KIND ?? "disposable") ?? "",
    "disposable",
    "REHEARSAL_TARGET_KIND"
  ) as ControlRecoveryRehearsalContext["kind"];
  const renderServiceName = trimOrThrow(
    readCliString(args, "render-service-name", process.env.REHEARSAL_RENDER_SERVICE_NAME ?? process.env.RENDER_SERVICE_NAME),
    "REHEARSAL_RENDER_SERVICE_NAME"
  );
  const cronSchedule = trimOrThrow(
    readCliString(args, "cron-schedule", process.env.REHEARSAL_CRON_SCHEDULE),
    "REHEARSAL_CRON_SCHEDULE"
  );
  const migrationDir = readCliString(args, "migrations-dir", process.env.REHEARSAL_MIGRATIONS_DIR ?? "migrations");
  const rehearsalId = readCliString(args, "rehearsal-id", process.env.REHEARSAL_ID);
  const defaultActor = buildDefaultActor(renderServiceName);
  const actor = {
    actorId: readCliString(args, "actor-id", process.env.REHEARSAL_ACTOR_ID ?? defaultActor.actorId) ?? defaultActor.actorId,
    displayName: readCliString(args, "actor-display-name", process.env.REHEARSAL_ACTOR_DISPLAY_NAME ?? defaultActor.displayName) ?? defaultActor.displayName,
    role: "admin" as const,
    sessionId: readCliString(args, "session-id", process.env.REHEARSAL_SESSION_ID ?? defaultActor.sessionId) ?? defaultActor.sessionId,
  };

  requireExact(executionSource, "automated", "REHEARSAL_EXECUTION_SOURCE");
  requireExact(orchestrationMode, "render_cron", "REHEARSAL_ORCHESTRATION_MODE");
  requireExact(automationProvider, "render", "REHEARSAL_AUTOMATION_PROVIDER");

  return {
    sourceDatabaseUrl,
    targetDatabaseUrl,
    environment,
    sourceContextLabel,
    targetContextLabel,
    sourceContextKind,
    targetContextKind,
    renderServiceName,
    cronSchedule,
    executionSource,
    executionContext: {
      orchestration: "render_cron",
      provider: "render",
      serviceName: renderServiceName,
      schedule: cronSchedule,
      trigger: "scheduled_refresh",
      runId: rehearsalId,
    },
    actor,
    migrationsDir: migrationDir,
    rehearsalId,
  };
}

export async function runRenderDatabaseRehearsalRefresh(
  config: RenderDatabaseRehearsalRefreshConfig,
  deps: RenderDatabaseRehearsalRefreshDependencies = {}
): Promise<DisposableDatabaseRehearsalResult> {
  validateRenderDatabaseRehearsalRefreshConfig(config);

  const openConnection =
    deps.openConnection ??
    ((databaseUrl: string) =>
      new Pool({ connectionString: databaseUrl }) as unknown as RenderRehearsalConnection);
  const closeConnection = deps.closeConnection ?? closePool;
  const buildEvidenceRepository =
    deps.buildEvidenceRepository ??
    ((sourceConnection: RenderRehearsalConnection) => new PostgresControlGovernanceRepository(sourceConnection as unknown as Pool));
  const runRehearsal = deps.runRehearsal ?? runDisposableDatabaseRehearsal;

  const sourceConnection = openConnection(config.sourceDatabaseUrl);
  const targetConnection = openConnection(config.targetDatabaseUrl);
  const evidenceRepository = buildEvidenceRepository(sourceConnection);
  const freshnessNotificationService = new DatabaseRehearsalFreshnessNotificationService({
    environment: config.environment,
    alertRepository: evidenceRepository,
    logger: console,
  });

  try {
    const result = await runRehearsal({
      environment: config.environment,
      sourceConnection,
      targetConnection,
      evidenceRepository,
      sourceContext: buildContext(config.sourceContextKind, config.sourceContextLabel),
      targetContext: buildContext(config.targetContextKind, config.targetContextLabel),
      actor: config.actor,
      sourceDatabaseUrl: config.sourceDatabaseUrl,
      targetDatabaseUrl: config.targetDatabaseUrl,
      migrationsDir: config.migrationsDir,
      rehearsalId: config.rehearsalId,
      executionSource: config.executionSource,
      executionContext: config.executionContext,
    });
    if (result.evidenceStored) {
      const freshnessStatus = await syncDatabaseRehearsalFreshnessState(evidenceRepository, config.environment, {
        nowMs: Date.parse(result.executedAt) || Date.now(),
      });
      if (freshnessStatus?.alert) {
        await freshnessNotificationService
          .dispatch({
            actor: config.actor.actorId,
            alert: freshnessStatus.alert,
            status: freshnessStatus,
            note: result.success ? "freshness refresh completed" : result.failureReason ?? "freshness refresh failed",
          })
          .catch((error) => {
            console.warn(
              "[render-db-rehearse] freshness notification dispatch failed",
              error instanceof Error ? error.message : String(error)
            );
          });
      }
    }
    return result;
  } finally {
    await closeConnection(targetConnection).catch(() => undefined);
    await closeConnection(sourceConnection).catch(() => undefined);
  }
}

function printResult(result: DisposableDatabaseRehearsalResult): void {
  console.log(JSON.stringify(result, null, 2));
  console.log(result.summary);
}

async function main(): Promise<number> {
  try {
    const config = parseRenderDatabaseRehearsalRefreshConfig();
    const result = await runRenderDatabaseRehearsalRefresh(config);
    printResult(result);
    return result.success ? 0 : 2;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

function isMainModule(): boolean {
  const entry = process.argv[1];
  return Boolean(entry) && pathToFileURL(entry).href === import.meta.url;
}

if (isMainModule()) {
  main()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    });
}
