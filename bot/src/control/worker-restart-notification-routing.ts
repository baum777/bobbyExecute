import type {
  WorkerRestartAlertNotificationEventType,
  WorkerRestartAlertNotificationStatus,
  WorkerRestartAlertNotificationSummary,
  WorkerRestartAlertRecord,
  WorkerRestartAlertSeverity,
} from "../persistence/worker-restart-alert-repository.js";

export type NotificationFormatterProfile = "generic" | "slack";
export type NotificationDestinationSlot = "primary" | "secondary" | "staging";
export type NotificationRoutingPolicyMode = "default" | "explicit";

export interface WorkerRestartNotificationDestinationConfig {
  slot: NotificationDestinationSlot;
  name: string;
  enabled: boolean;
  priority: number;
  formatterProfile: NotificationFormatterProfile;
  url?: string;
  token?: string;
  headerName?: string;
  cooldownMs?: number;
  required?: boolean;
  recoveryEnabled: boolean;
  repeatedFailureSummaryEnabled: boolean;
  allowWarning: boolean;
  environmentScope: "production" | "staging" | "all";
  tags: string[];
  formatterError?: string;
}

export interface WorkerRestartNotificationRoutingContext {
  environment: string;
  alert: WorkerRestartAlertRecord;
  eventType: WorkerRestartAlertNotificationEventType;
  previousSummary?: WorkerRestartAlertNotificationSummary;
  nowMs?: number;
}

export interface WorkerRestartNotificationRouteDecision {
  destination: WorkerRestartNotificationDestinationConfig;
  status: "send" | "skipped" | "suppressed" | "failed";
  reason: string;
}

export interface WorkerRestartNotificationDestinationBuildResult {
  routingPolicyMode: NotificationRoutingPolicyMode;
  destinations: WorkerRestartNotificationDestinationConfig[];
}

function trimOrUndefined(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

function parseBoolean(value: string | undefined, fallback = false): boolean {
  const trimmed = value?.trim().toLowerCase();
  if (!trimmed) return fallback;
  return trimmed === "true" || trimmed === "1" || trimmed === "yes";
}

function parseInteger(value: string | undefined, fallback: number, minimum = 0): number {
  const trimmed = value?.trim();
  if (!trimmed) return fallback;
  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(parsed) || parsed < minimum) return fallback;
  return parsed;
}

function parseFormatterProfile(value: string | undefined): {
  formatterProfile: NotificationFormatterProfile;
  formatterError?: string;
} {
  const normalized = trimOrUndefined(value)?.toLowerCase();
  if (normalized === "slack") {
    return { formatterProfile: "slack" };
  }
  if (normalized === "generic" || normalized == null) {
    return { formatterProfile: "generic" };
  }
  return {
    formatterProfile: "generic",
    formatterError: `invalid formatter profile: ${normalized}`,
  };
}

function parseList(value: string | undefined): string[] {
  const trimmed = trimOrUndefined(value);
  if (!trimmed) return [];
  return trimmed
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function fallbackEnv(slot: NotificationDestinationSlot, env: NodeJS.ProcessEnv, suffix: string): string | undefined {
  if (slot === "primary") {
    return trimOrUndefined(env[`CONTROL_RESTART_ALERT_WEBHOOK_${suffix}`]);
  }
  return undefined;
}

function classifyEnvironment(environment: string): "production" | "staging" | "other" {
  const normalized = environment.trim().toLowerCase();
  if (normalized.includes("staging")) return "staging";
  if (normalized.includes("prod")) return "production";
  return "other";
}

function defaultSlotConfig(slot: NotificationDestinationSlot): Omit<WorkerRestartNotificationDestinationConfig, "enabled" | "url" | "token" | "headerName" | "formatterError"> {
  switch (slot) {
    case "secondary":
      return {
        slot,
        name: "secondary",
        priority: 20,
        formatterProfile: "generic",
        cooldownMs: 5 * 60 * 1000,
        required: false,
        recoveryEnabled: true,
        repeatedFailureSummaryEnabled: true,
        allowWarning: false,
        environmentScope: "production",
        tags: ["secondary", "production"],
      };
    case "staging":
      return {
        slot,
        name: "staging",
        priority: 30,
        formatterProfile: "generic",
        cooldownMs: 5 * 60 * 1000,
        required: false,
        recoveryEnabled: true,
        repeatedFailureSummaryEnabled: false,
        allowWarning: false,
        environmentScope: "staging",
        tags: ["staging"],
      };
    case "primary":
    default:
      return {
        slot: "primary",
        name: "primary",
        priority: 10,
        formatterProfile: "generic",
        cooldownMs: 5 * 60 * 1000,
        required: false,
        recoveryEnabled: true,
        repeatedFailureSummaryEnabled: false,
        allowWarning: false,
        environmentScope: "production",
        tags: ["primary", "production"],
      };
  }
}

function buildDestinationConfig(
  slot: NotificationDestinationSlot,
  env: NodeJS.ProcessEnv
): WorkerRestartNotificationDestinationConfig {
  const defaults = defaultSlotConfig(slot);
  const prefix = slot.toUpperCase();
  const url = trimOrUndefined(env[`NOTIFY_WEBHOOK_${prefix}_URL`]) ?? fallbackEnv(slot, env, "URL");
  const token = trimOrUndefined(env[`NOTIFY_WEBHOOK_${prefix}_TOKEN`]) ?? fallbackEnv(slot, env, "TOKEN");
  const headerName = trimOrUndefined(env[`NOTIFY_WEBHOOK_${prefix}_HEADER`]) ?? fallbackEnv(slot, env, "HEADER");
  const formatter = parseFormatterProfile(env[`NOTIFY_${prefix}_FORMAT`]);
  const enabled = parseBoolean(env[`NOTIFY_WEBHOOK_${prefix}_ENABLED`], Boolean(url));
  const cooldownMs = parseInteger(env[`NOTIFY_${prefix}_COOLDOWN_MS`], defaults.cooldownMs ?? 5 * 60 * 1000, 0);
  const recoveryEnabled = parseBoolean(env[`NOTIFY_${prefix}_RECOVERY_ENABLED`], defaults.recoveryEnabled);
  const repeatedFailureSummaryEnabled = parseBoolean(
    env[`NOTIFY_${prefix}_REPEATED_FAILURE_SUMMARY_ENABLED`],
    defaults.repeatedFailureSummaryEnabled
  );
  const allowWarning = parseBoolean(env[`NOTIFY_${prefix}_ALLOW_WARNING`], defaults.allowWarning);
  const priority = parseInteger(env[`NOTIFY_${prefix}_PRIORITY`], defaults.priority, 0);
  const tags = parseList(env[`NOTIFY_${prefix}_TAGS`]);
  const environmentScope = (() => {
    const configured = trimOrUndefined(env[`NOTIFY_${prefix}_ENVIRONMENT_SCOPE`])?.toLowerCase();
    if (configured === "production" || configured === "staging" || configured === "all") {
      return configured;
    }
    return defaults.environmentScope;
  })();

  return {
    ...defaults,
    enabled,
    url,
    token,
    headerName,
    cooldownMs,
    recoveryEnabled,
    repeatedFailureSummaryEnabled,
    allowWarning,
    priority,
    tags: tags.length > 0 ? tags : defaults.tags,
    environmentScope,
    formatterProfile: formatter.formatterProfile,
    formatterError: formatter.formatterError,
  };
}

export function buildNotificationDestinationsFromEnv(
  env: NodeJS.ProcessEnv = process.env
): WorkerRestartNotificationDestinationBuildResult {
  const routingPolicyMode = (trimOrUndefined(env.NOTIFY_ROUTING_POLICY_MODE)?.toLowerCase() === "explicit"
    ? "explicit"
    : "default") as NotificationRoutingPolicyMode;

  return {
    routingPolicyMode,
    destinations: [buildDestinationConfig("primary", env), buildDestinationConfig("secondary", env), buildDestinationConfig("staging", env)],
  };
}

function destinationMatchesEnvironment(
  destination: WorkerRestartNotificationDestinationConfig,
  environment: string
): boolean {
  const bucket = classifyEnvironment(environment);
  if (destination.environmentScope === "all") {
    return true;
  }
  if (bucket === "production") {
    return destination.environmentScope === "production";
  }
  if (bucket === "staging") {
    return destination.environmentScope === "staging";
  }
  return false;
}

function latestDestinationEvent(
  summary: WorkerRestartAlertNotificationSummary | undefined,
  destinationName: string
): {
  status?: WorkerRestartAlertNotificationStatus;
  lastAttemptedAt?: string;
  lastFailureReason?: string;
  suppressionReason?: string;
  routeReason?: string;
} | undefined {
  return summary?.destinations?.find((destination) => destination.name === destinationName);
}

function latestSentDestinationNames(summary: WorkerRestartAlertNotificationSummary | undefined): Set<string> {
  return new Set(
    (summary?.destinations ?? [])
      .filter((destination) => destination.latestDeliveryStatus === "sent")
      .map((destination) => destination.name)
  );
}

export function resolveNotificationRoutes(
  context: WorkerRestartNotificationRoutingContext,
  destinations: WorkerRestartNotificationDestinationConfig[]
): WorkerRestartNotificationRouteDecision[] {
  const orderedDestinations = [...destinations].sort((left, right) => {
    const priorityDiff = left.priority - right.priority;
    if (priorityDiff !== 0) return priorityDiff;
    return left.name.localeCompare(right.name);
  });
  const previouslySent = latestSentDestinationNames(context.previousSummary);
  const nowMs = context.nowMs ?? Date.now();

  return orderedDestinations.map((destination) => {
    const previous = latestDestinationEvent(context.previousSummary, destination.name);
    const latestAttemptAt = previous?.lastAttemptedAt ? Date.parse(previous.lastAttemptedAt) : undefined;
    const cooldownMs = destination.cooldownMs ?? 5 * 60 * 1000;
    const recoveryEvent = context.eventType === "alert_resolved";

    if (!recoveryEvent && latestAttemptAt != null && Number.isFinite(latestAttemptAt) && nowMs - latestAttemptAt < cooldownMs) {
      return {
        destination,
        status: "suppressed" as const,
        reason: `cooldown active for ${destination.name}`,
      };
    }

    if (!destination.enabled) {
      return {
        destination,
        status: "skipped" as const,
        reason: `destination ${destination.name} is disabled`,
      };
    }

    if (!destinationMatchesEnvironment(destination, context.environment)) {
      return {
        destination,
        status: "skipped" as const,
        reason: `destination ${destination.name} is not selected for ${context.environment}`,
      };
    }

    if (!recoveryEvent && context.alert.severity !== "critical" && !destination.allowWarning) {
      return {
        destination,
        status: "skipped" as const,
        reason: "warning alerts are local-only by default",
      };
    }

    if (context.eventType === "alert_acknowledged") {
      return {
        destination,
        status: "skipped" as const,
        reason: "acknowledgements stay local-only",
      };
    }

    if (context.eventType === "alert_repeated_failure_summary" && !destination.repeatedFailureSummaryEnabled) {
      return {
        destination,
        status: "skipped" as const,
        reason: "destination is not selected for repeated-failure summaries",
      };
    }

    if (context.eventType === "alert_resolved" && !destination.recoveryEnabled && !previouslySent.has(destination.name)) {
      return {
        destination,
        status: "skipped" as const,
        reason: "recovery notification is not configured for this destination",
      };
    }

    if (destination.formatterError) {
      return {
        destination,
        status: "failed" as const,
        reason: destination.formatterError,
      };
    }

    if (!destination.url) {
      return {
        destination,
        status: "failed" as const,
        reason: "webhook configuration is missing",
      };
    }

    try {
      // Validate before dispatching so malformed configuration fails closed.
      void new URL(destination.url);
    } catch {
      return {
        destination,
        status: "failed" as const,
        reason: "webhook URL is malformed",
      };
    }

    return {
      destination,
      status: "send" as const,
      reason: "destination selected by routing policy",
    };
  });
}
