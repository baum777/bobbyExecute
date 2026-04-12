import { describe, expect, it, vi } from "vitest";
import { formatBootstrapEnv, resolveDatabaseBootstrap } from "../../src/scripts/db-bootstrap.js";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
    },
  });
}

function makeBranch(id: string, name: string, isDefault = false) {
  return {
    id,
    project_id: "proj-1",
    name,
    default: isDefault,
    current_state: "ready",
    state_changed_at: "2026-04-12T00:00:00.000Z",
    creation_source: "console",
    created_at: "2026-04-12T00:00:00.000Z",
    updated_at: "2026-04-12T00:00:00.000Z",
    protected: false,
    cpu_used_sec: 0,
    active_time_seconds: 0,
    compute_time_seconds: 0,
    written_data_bytes: 0,
    data_transfer_bytes: 0,
  };
}

function makeDatabase(name: string, owner_name = "app_owner") {
  return {
    id: 1,
    branch_id: "br-main",
    name,
    owner_name,
    created_at: "2026-04-12T00:00:00.000Z",
    updated_at: "2026-04-12T00:00:00.000Z",
  };
}

function makeRole(name: string) {
  return {
    branch_id: "br-main",
    name,
    created_at: "2026-04-12T00:00:00.000Z",
    updated_at: "2026-04-12T00:00:00.000Z",
  };
}

describe("database bootstrap", () => {
  it("keeps an existing DATABASE_URL and does not call Neon", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("fetch should not be called when DATABASE_URL already exists");
    });

    const resolution = await resolveDatabaseBootstrap({
      env: {
        DATABASE_URL: "postgresql://existing:secret@localhost:5432/existing",
        DIRECT_URL: "postgresql://direct:secret@localhost:5432/direct",
      },
      fetchImpl: fetchImpl as typeof fetch,
    });

    expect(resolution.source).toBe("existing");
    expect(resolution.databaseUrl).toBe("postgresql://existing:secret@localhost:5432/existing");
    expect(resolution.directUrl).toBe("postgresql://direct:secret@localhost:5432/direct");
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(formatBootstrapEnv(resolution)).toContain("DATABASE_URL=postgresql://existing:secret@localhost:5432/existing");
  });

  it("resolves pooled and direct Neon URLs from a single project", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));

      if (url.pathname === "/api/v2/projects" && url.searchParams.get("cursor") == null) {
        return jsonResponse({
          projects: [{ id: "proj-1", name: "proj-1" }],
          pagination: {},
        });
      }

      if (url.pathname === "/api/v2/projects/proj-1/branches" && url.searchParams.get("cursor") == null) {
        return jsonResponse({
          branches: [makeBranch("br-main", "main", true)],
          pagination: {},
        });
      }

      if (url.pathname === "/api/v2/projects/proj-1/branches/br-main/databases") {
        return jsonResponse({
          databases: [makeDatabase("appdb")],
        });
      }

      if (url.pathname === "/api/v2/projects/proj-1/branches/br-main/roles") {
        return jsonResponse({
          roles: [makeRole("app_owner")],
        });
      }

      if (url.pathname === "/api/v2/projects/proj-1/connection_uri") {
        const pooled = url.searchParams.get("pooled") === "true";
        return jsonResponse({
          uri: pooled
            ? "postgresql://app_owner:secret@ep-proj-1-pooler.us-east-1.aws.neon.tech/appdb?sslmode=require"
            : "postgresql://app_owner:secret@ep-proj-1.us-east-1.aws.neon.tech/appdb?sslmode=require",
        });
      }

      throw new Error(`Unexpected Neon API request: ${url.pathname}${url.search}`);
    });

    const resolution = await resolveDatabaseBootstrap({
      env: {
        NEON_API_KEY: "neon-test-key",
      },
      fetchImpl: fetchImpl as typeof fetch,
    });

    expect(resolution.source).toBe("neon");
    expect(resolution.databaseUrl).toContain("-pooler.us-east-1.aws.neon.tech");
    expect(resolution.directUrl).toContain("ep-proj-1.us-east-1.aws.neon.tech");
    expect(resolution.projectId).toBe("proj-1");
    expect(resolution.branchId).toBe("br-main");
    expect(resolution.databaseName).toBe("appdb");
    expect(resolution.roleName).toBe("app_owner");
    expect(fetchImpl).toHaveBeenCalled();
  });

  it("fails closed when multiple Neon projects are visible without a project hint", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.pathname === "/api/v2/projects") {
        return jsonResponse({
          projects: [
            { id: "proj-1", name: "proj-1" },
            { id: "proj-2", name: "proj-2" },
          ],
          pagination: {},
        });
      }

      throw new Error(`Unexpected Neon API request: ${url.pathname}${url.search}`);
    });

    await expect(
      resolveDatabaseBootstrap({
        env: {
          NEON_API_KEY: "neon-test-key",
        },
        fetchImpl: fetchImpl as typeof fetch,
      })
    ).rejects.toThrow(/NEON_PROJECT_ID/);
  });
});
