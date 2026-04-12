import { Pool, type PoolConfig } from "pg";

const SUPABASE_HOST_SUFFIXES = [".supabase.co", ".supabase.com", ".pooler.supabase.com"];
const NEON_HOST_SUFFIXES = [".neon.tech", ".neon.build"];

function isSupabaseHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return SUPABASE_HOST_SUFFIXES.some((suffix) => normalized === suffix.slice(1) || normalized.endsWith(suffix));
}

function isNeonHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return NEON_HOST_SUFFIXES.some((suffix) => normalized === suffix.slice(1) || normalized.endsWith(suffix));
}

export function normalizeDatabaseUrl(databaseUrl: string): string {
  const trimmed = databaseUrl.trim();
  if (!trimmed) {
    return trimmed;
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return trimmed;
  }

  if (!isSupabaseHostname(url.hostname) || url.searchParams.has("sslmode")) {
    return trimmed;
  }

  url.searchParams.set("sslmode", "require");
  return url.toString();
}

export function buildPostgresPoolConfig(databaseUrl: string): PoolConfig {
  const normalized = normalizeDatabaseUrl(databaseUrl);
  const url = new URL(normalized);
  const isSupabase = isSupabaseHostname(url.hostname);
  const isNeon = isNeonHostname(url.hostname);
  const sslmode = url.searchParams.get("sslmode");
  const shouldUseSsl = isSupabase || isNeon || (sslmode != null && sslmode.toLowerCase() !== "disable");

  const port = url.port ? Number(url.port) : undefined;
  const database = url.pathname.replace(/^\/+/, "") || undefined;

  return {
    host: url.hostname,
    port: Number.isFinite(port) ? port : undefined,
    user: decodeURIComponent(url.username || ""),
    password: decodeURIComponent(url.password || ""),
    database,
    ...(shouldUseSsl ? { ssl: { rejectUnauthorized: false } } : {}),
  };
}

export function createPostgresPool(databaseUrl: string): Pool {
  return new Pool(buildPostgresPoolConfig(databaseUrl));
}
