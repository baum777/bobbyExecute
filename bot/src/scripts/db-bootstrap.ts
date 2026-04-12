import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseCliArgs, readCliString } from "./cli.js";

interface NeonProjectSummary {
  id: string;
  name: string;
  org_id?: string;
}

interface NeonBranchSummary {
  id: string;
  project_id: string;
  name: string;
  default?: boolean;
  current_state: string;
  state_changed_at: string;
  creation_source: string;
  created_at: string;
  updated_at: string;
  protected: boolean;
  cpu_used_sec: number;
  active_time_seconds: number;
  compute_time_seconds: number;
  written_data_bytes: number;
  data_transfer_bytes: number;
}

interface NeonDatabaseSummary {
  id: number;
  branch_id: string;
  name: string;
  owner_name: string;
  created_at: string;
  updated_at: string;
}

interface NeonRoleSummary {
  branch_id: string;
  name: string;
  created_at: string;
  updated_at: string;
  password?: string;
}

interface NeonProjectsResponse {
  projects: NeonProjectSummary[];
  pagination?: {
    next?: string;
  };
}

interface NeonBranchesResponse {
  branches: NeonBranchSummary[];
  pagination?: {
    next?: string;
  };
}

interface NeonDatabasesResponse {
  databases: NeonDatabaseSummary[];
}

interface NeonRolesResponse {
  roles: NeonRoleSummary[];
}

interface NeonConnectionUriResponse {
  uri: string;
}

interface BootstrapResolutionHints {
  apiBaseUrl: string;
  apiKey: string;
  orgId?: string;
  projectId?: string;
  projectName?: string;
  branchId?: string;
  branchName?: string;
  databaseName?: string;
  roleName?: string;
  endpointId?: string;
}

export interface DatabaseBootstrapResolution {
  source: "existing" | "neon";
  databaseUrl: string;
  directUrl?: string;
  projectId?: string;
  projectName?: string;
  branchId?: string;
  branchName?: string;
  databaseName?: string;
  roleName?: string;
}

export interface DatabaseBootstrapOptions {
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
}

export interface DatabaseBootstrapRunOptions extends DatabaseBootstrapOptions {
  emitEnv?: boolean;
  migrationsDir?: string;
}

function trimOrUndefined(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function fail(message: string): never {
  throw new Error(message);
}

function buildNeonApiUrl(apiBaseUrl: string, path: string): URL {
  const normalizedBase = apiBaseUrl.endsWith("/") ? apiBaseUrl : `${apiBaseUrl}/`;
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  return new URL(normalizedPath, normalizedBase);
}

function authHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    Accept: "application/json",
  };
}

async function readNeonResponse<T>(response: Response, requestLabel: string): Promise<T> {
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    const suffix = detail.trim() ? `: ${detail.trim().slice(0, 500)}` : "";
    throw new Error(`Neon API request failed for ${requestLabel} (${response.status} ${response.statusText})${suffix}`);
  }

  return (await response.json()) as T;
}

async function neonGet<T>(
  fetchImpl: typeof fetch,
  apiBaseUrl: string,
  apiKey: string,
  path: string,
  searchParams: Record<string, string | undefined> = {}
): Promise<T> {
  const url = buildNeonApiUrl(apiBaseUrl, path);
  for (const [key, value] of Object.entries(searchParams)) {
    if (value != null && value !== "") {
      url.searchParams.set(key, value);
    }
  }

  const response = await fetchImpl(url, {
    method: "GET",
    headers: authHeaders(apiKey),
  });

  return await readNeonResponse<T>(response, `${url.pathname}${url.search}`);
}

async function neonGetAllPages<T>(
  fetchImpl: typeof fetch,
  apiBaseUrl: string,
  apiKey: string,
  path: string,
  itemKey: keyof T,
  searchParams: Record<string, string | undefined> = {}
): Promise<Array<unknown>> {
  const items: Array<unknown> = [];
  let cursor: string | undefined;

  for (;;) {
    const page = await neonGet<T>(fetchImpl, apiBaseUrl, apiKey, path, {
      ...searchParams,
      limit: "400",
      cursor,
    });
    const pageItems = page[itemKey];
    if (!Array.isArray(pageItems)) {
      fail(`Neon API response for ${path} did not contain an array at ${String(itemKey)}.`);
    }

    items.push(...pageItems);
    const pagination = (page as { pagination?: { next?: string } }).pagination;
    cursor = trimOrUndefined(pagination?.next);
    if (!cursor) {
      break;
    }
  }

  return items;
}

function formatCandidates(values: Array<{ id?: string | number; name?: string }>): string {
  return values
    .map((value) => [value.id, value.name].filter((part) => part != null && part !== "").join(" / "))
    .filter((value) => value.length > 0)
    .join(", ");
}

function pickUnique<T>(
  candidates: T[],
  kind: string,
  messageSuffix: string,
  describe: (candidate: T) => { id?: string | number; name?: string } = (candidate: T) =>
    candidate as unknown as { id?: string | number; name?: string }
): T {
  if (candidates.length === 1) {
    return candidates[0];
  }

  if (candidates.length === 0) {
    fail(`No Neon ${kind} matched ${messageSuffix}.`);
  }

  fail(`Multiple Neon ${kind}s matched ${messageSuffix}: ${formatCandidates(candidates.map(describe))}.`);
}

async function listProjects(
  fetchImpl: typeof fetch,
  apiBaseUrl: string,
  apiKey: string,
  orgId?: string,
  search?: string
): Promise<NeonProjectSummary[]> {
  const items = (await neonGetAllPages<NeonProjectsResponse>(fetchImpl, apiBaseUrl, apiKey, "/projects", "projects", {
    org_id: orgId,
    search,
  })) as NeonProjectSummary[];
  return items;
}

async function getProjectById(
  fetchImpl: typeof fetch,
  apiBaseUrl: string,
  apiKey: string,
  projectId: string
): Promise<NeonProjectSummary> {
  const response = await neonGet<{ project: NeonProjectSummary }>(
    fetchImpl,
    apiBaseUrl,
    apiKey,
    `/projects/${encodeURIComponent(projectId)}`
  );
  return response.project;
}

async function listBranches(
  fetchImpl: typeof fetch,
  apiBaseUrl: string,
  apiKey: string,
  projectId: string,
  search?: string
): Promise<NeonBranchSummary[]> {
  const items = (await neonGetAllPages<NeonBranchesResponse>(
    fetchImpl,
    apiBaseUrl,
    apiKey,
    `/projects/${encodeURIComponent(projectId)}/branches`,
    "branches",
    {
      search,
    }
  )) as NeonBranchSummary[];
  return items;
}

async function listDatabases(
  fetchImpl: typeof fetch,
  apiBaseUrl: string,
  apiKey: string,
  projectId: string,
  branchId: string
): Promise<NeonDatabaseSummary[]> {
  const response = await neonGet<NeonDatabasesResponse>(
    fetchImpl,
    apiBaseUrl,
    apiKey,
    `/projects/${encodeURIComponent(projectId)}/branches/${encodeURIComponent(branchId)}/databases`
  );
  return response.databases;
}

async function listRoles(
  fetchImpl: typeof fetch,
  apiBaseUrl: string,
  apiKey: string,
  projectId: string,
  branchId: string
): Promise<NeonRoleSummary[]> {
  const response = await neonGet<NeonRolesResponse>(
    fetchImpl,
    apiBaseUrl,
    apiKey,
    `/projects/${encodeURIComponent(projectId)}/branches/${encodeURIComponent(branchId)}/roles`
  );
  return response.roles;
}

async function resolveProject(
  fetchImpl: typeof fetch,
  hints: BootstrapResolutionHints
): Promise<NeonProjectSummary> {
  if (hints.projectId) {
    const project = await getProjectById(fetchImpl, hints.apiBaseUrl, hints.apiKey, hints.projectId);
    if (hints.projectName && project.name !== hints.projectName && project.id !== hints.projectName) {
      fail(
        `NEON_PROJECT_ID resolved to project ${project.id}, but NEON_PROJECT_NAME=${hints.projectName} does not match.`
      );
    }
    return project;
  }

  const candidates = await listProjects(fetchImpl, hints.apiBaseUrl, hints.apiKey, hints.orgId, hints.projectName);
  if (hints.projectName) {
    const exactMatches = candidates.filter((project) => project.id === hints.projectName || project.name === hints.projectName);
    if (exactMatches.length === 1) {
      return exactMatches[0];
    }

    if (candidates.length === 1) {
      return candidates[0];
    }

    fail(
      `NEON_PROJECT_NAME=${hints.projectName} matched ${candidates.length} project(s). Set NEON_PROJECT_ID to disambiguate.`
    );
  }

  if (candidates.length === 1) {
    return candidates[0];
  }

  fail(
    `Unable to resolve a Neon project from NEON_API_KEY alone. Set NEON_PROJECT_ID or NEON_PROJECT_NAME. Available projects: ${formatCandidates(candidates)}.`
  );
}

function resolveBranch(
  branches: NeonBranchSummary[],
  hints: BootstrapResolutionHints
): NeonBranchSummary {
  if (hints.branchId) {
    return pickUnique(
      branches.filter((branch) => branch.id === hints.branchId),
      "branch",
      `NEON_BRANCH_ID=${hints.branchId}`,
      (branch) => ({ id: branch.id, name: branch.name })
    );
  }

  if (hints.branchName) {
    const exactMatches = branches.filter((branch) => branch.name === hints.branchName || branch.id === hints.branchName);
    if (exactMatches.length === 1) {
      return exactMatches[0];
    }
    if (branches.length === 1) {
      return branches[0];
    }

    fail(
      `NEON_BRANCH_NAME=${hints.branchName} matched ${branches.length} branch(es). Set NEON_BRANCH_ID to disambiguate.`
    );
  }

  const defaultBranches = branches.filter((branch) => Boolean(branch.default));
  if (defaultBranches.length === 1) {
    return defaultBranches[0];
  }

  if (branches.length === 1) {
    return branches[0];
  }

  fail(
    `Unable to resolve a Neon branch from NEON_API_KEY alone. Set NEON_BRANCH_ID or NEON_BRANCH_NAME. Available branches: ${formatCandidates(branches)}.`
  );
}

function resolveDatabase(
  databases: NeonDatabaseSummary[],
  hints: BootstrapResolutionHints
): NeonDatabaseSummary {
  if (hints.databaseName) {
    return pickUnique(
      databases.filter((database) => database.name === hints.databaseName),
      "database",
      `NEON_DATABASE_NAME=${hints.databaseName}`,
      (database) => ({ id: database.id, name: database.name })
    );
  }

  const canonical = databases.find((database) => database.name === "neondb");
  if (canonical) {
    return canonical;
  }

  if (databases.length === 1) {
    return databases[0];
  }

  fail(
    `Unable to resolve a Neon database from NEON_API_KEY alone. Set NEON_DATABASE_NAME. Available databases: ${formatCandidates(databases)}.`
  );
}

function resolveRole(
  roles: NeonRoleSummary[],
  database: NeonDatabaseSummary,
  hints: BootstrapResolutionHints
): NeonRoleSummary {
  if (hints.roleName) {
    return pickUnique(
      roles.filter((role) => role.name === hints.roleName),
      "role",
      `NEON_ROLE_NAME=${hints.roleName}`,
      (role) => ({ name: role.name })
    );
  }

  const ownerMatch = roles.find((role) => role.name === database.owner_name);
  if (ownerMatch) {
    return ownerMatch;
  }

  const canonical = roles.find((role) => role.name === "neondb_owner");
  if (canonical) {
    return canonical;
  }

  if (roles.length === 1) {
    return roles[0];
  }

  fail(
    `Unable to resolve a Neon role from NEON_API_KEY alone. Set NEON_ROLE_NAME. Available roles: ${formatCandidates(roles)}.`
  );
}

async function resolveNeonDatabaseBootstrap(
  fetchImpl: typeof fetch,
  hints: BootstrapResolutionHints
): Promise<DatabaseBootstrapResolution> {
  const project = await resolveProject(fetchImpl, hints);
  const branches = await listBranches(fetchImpl, hints.apiBaseUrl, hints.apiKey, project.id, hints.branchName);
  const branch = resolveBranch(branches, hints);
  const databases = await listDatabases(fetchImpl, hints.apiBaseUrl, hints.apiKey, project.id, branch.id);
  const database = resolveDatabase(databases, hints);
  const roles = await listRoles(fetchImpl, hints.apiBaseUrl, hints.apiKey, project.id, branch.id);
  const role = resolveRole(roles, database, hints);

  const directUrl = await neonGet<NeonConnectionUriResponse>(
    fetchImpl,
    hints.apiBaseUrl,
    hints.apiKey,
    `/projects/${encodeURIComponent(project.id)}/connection_uri`,
    {
      branch_id: branch.id,
      database_name: database.name,
      role_name: role.name,
      endpoint_id: hints.endpointId,
      pooled: "false",
    }
  );
  const pooledUrl = await neonGet<NeonConnectionUriResponse>(
    fetchImpl,
    hints.apiBaseUrl,
    hints.apiKey,
    `/projects/${encodeURIComponent(project.id)}/connection_uri`,
    {
      branch_id: branch.id,
      database_name: database.name,
      role_name: role.name,
      endpoint_id: hints.endpointId,
      pooled: "true",
    }
  );

  return {
    source: "neon",
    databaseUrl: pooledUrl.uri.trim(),
    directUrl: directUrl.uri.trim(),
    projectId: project.id,
    projectName: project.name,
    branchId: branch.id,
    branchName: branch.name,
    databaseName: database.name,
    roleName: role.name,
  };
}

export async function resolveDatabaseBootstrap(
  options: DatabaseBootstrapOptions = {}
): Promise<DatabaseBootstrapResolution> {
  const env = options.env ?? process.env;
  const fetchImpl = options.fetchImpl ?? fetch;
  const databaseUrl = trimOrUndefined(env.DATABASE_URL);
  const directUrl = trimOrUndefined(env.DIRECT_URL);

  if (databaseUrl) {
    return {
      source: "existing",
      databaseUrl,
      directUrl,
    };
  }

  const apiKey = trimOrUndefined(env.NEON_API_KEY);
  if (!apiKey) {
    fail(
      "DATABASE_URL is missing and NEON_API_KEY is not set. Provide DATABASE_URL directly or configure the Neon bootstrap envs."
    );
  }

  const hints: BootstrapResolutionHints = {
    apiBaseUrl: trimOrUndefined(env.NEON_API_BASE_URL) ?? "https://console.neon.tech/api/v2",
    apiKey,
    orgId: trimOrUndefined(env.NEON_ORG_ID),
    projectId: trimOrUndefined(env.NEON_PROJECT_ID),
    projectName: trimOrUndefined(env.NEON_PROJECT_NAME),
    branchId: trimOrUndefined(env.NEON_BRANCH_ID),
    branchName: trimOrUndefined(env.NEON_BRANCH_NAME),
    databaseName: trimOrUndefined(env.NEON_DATABASE_NAME),
    roleName: trimOrUndefined(env.NEON_ROLE_NAME),
    endpointId: trimOrUndefined(env.NEON_ENDPOINT_ID),
  };

  return await resolveNeonDatabaseBootstrap(fetchImpl, hints);
}

export function formatBootstrapEnv(resolution: DatabaseBootstrapResolution): string {
  const lines = [`DATABASE_URL=${resolution.databaseUrl}`];
  if (resolution.directUrl) {
    lines.push(`DIRECT_URL=${resolution.directUrl}`);
  }
  return lines.join("\n");
}

export async function runDatabaseBootstrap(options: DatabaseBootstrapRunOptions = {}): Promise<number> {
  const env = options.env ?? process.env;
  const resolution = await resolveDatabaseBootstrap(options);
  const emitEnv = options.emitEnv ?? false;
  const migrationsDir = trimOrUndefined(options.migrationsDir);

  if (emitEnv) {
    console.log(formatBootstrapEnv(resolution));
    return 0;
  }

  if (resolution.source === "existing") {
    console.error("Using existing DATABASE_URL for migration bootstrap.");
  } else {
    console.error(
      `Resolved Neon connection for project ${resolution.projectId ?? "unknown"} branch ${resolution.branchId ?? "unknown"}.`
    );
  }

  const migrateScript = fileURLToPath(new URL("./db-migrate.js", import.meta.url));
  const child = spawn(process.execPath, [migrateScript, ...(migrationsDir ? ["--migrations-dir", migrationsDir] : [])], {
    stdio: "inherit",
    env: {
      ...env,
      DATABASE_URL: resolution.databaseUrl,
      ...(resolution.directUrl ? { DIRECT_URL: resolution.directUrl } : {}),
    },
  });

  const code = await new Promise<number>((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (exitCode) => resolve(exitCode ?? 1));
  });

  return code;
}

async function main(): Promise<number> {
  try {
    const args = parseCliArgs(process.argv.slice(2));
    const emitEnv = Boolean(args["emit-env"]);
    const migrationDir = readCliString(args, "migrations-dir");
    return await runDatabaseBootstrap({
      env: process.env,
      emitEnv,
      migrationsDir: migrationDir,
    });
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    });
}
