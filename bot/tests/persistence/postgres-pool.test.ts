import { describe, expect, it } from "vitest";
import { buildPostgresPoolConfig, normalizeDatabaseUrl } from "../../src/persistence/postgres-pool.js";

describe("postgres pool config", () => {
  it("enables SSL for Neon URLs", () => {
    const config = buildPostgresPoolConfig(
      "postgresql://app_owner:secret@ep-proj-1.us-east-1.aws.neon.tech/appdb?sslmode=require"
    );

    expect(normalizeDatabaseUrl("postgresql://app_owner:secret@ep-proj-1.us-east-1.aws.neon.tech/appdb?sslmode=require")).toContain(
      "sslmode=require"
    );
    expect(config.host).toBe("ep-proj-1.us-east-1.aws.neon.tech");
    expect(config.database).toBe("appdb");
    expect(config.ssl).toEqual({ rejectUnauthorized: false });
  });

  it("leaves local URLs without SSL", () => {
    const config = buildPostgresPoolConfig("postgresql://user:secret@127.0.0.1:5432/appdb");

    expect(config.host).toBe("127.0.0.1");
    expect(config.port).toBe(5432);
    expect(config.ssl).toBeUndefined();
  });
});
