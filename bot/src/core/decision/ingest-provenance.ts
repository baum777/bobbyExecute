/**
 * Ingest-time data quality gates for canonical provenance (PR-C1).
 * Does not change scoring; only fail-closed validation with explicit reason classes.
 */
import { sha256 } from "../determinism/hash.js";
import type { MarketSnapshot } from "../contracts/market.js";
import type { WalletSnapshot } from "../contracts/wallet.js";
import type { DecisionReasonClass } from "../contracts/decision-reason-class.js";

/** Maximum observed age for market snapshot at decision time (deterministic block if exceeded). */
export const MAX_MARKET_DATA_AGE_MS = 60_000;
/** Maximum observed age for wallet snapshot at decision time. */
export const MAX_WALLET_DATA_AGE_MS = 60_000;

export interface DecisionFreshnessSnapshot {
  /** Age of market data in ms at coordinator bind time. */
  marketAgeMs: number;
  /** Age of wallet data in ms at coordinator bind time. */
  walletAgeMs: number;
  /** Strict ceiling used for both (for operator clarity). */
  maxAgeMs: number;
  /** ISO time when freshness was evaluated. */
  observedAt: string;
}

export interface DecisionEvidenceRef {
  marketRawHash?: string;
  walletRawHash?: string;
  signalPackHash?: string;
}

export interface IngestValidationResult {
  ok: boolean;
  blockedReason?: string;
  reasonClass?: DecisionReasonClass;
  sources: string[];
  freshness: DecisionFreshnessSnapshot;
  evidenceRef: DecisionEvidenceRef;
}

function parseIsoMs(iso: string): number {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : NaN;
}

/**
 * Validate ingest snapshots and build provenance fields. Fail-closed on stale / missing / degraded market.
 */
export function validateIngestAndBuildProvenance(
  market: MarketSnapshot,
  wallet: WalletSnapshot,
  nowMs: number
): IngestValidationResult {
  const observedAt = new Date(nowMs).toISOString();

  const marketTs = parseIsoMs(market.timestamp);
  const walletTs = parseIsoMs(wallet.timestamp);
  const marketAgeMs = Number.isFinite(marketTs) ? Math.max(0, nowMs - marketTs) : MAX_MARKET_DATA_AGE_MS + 1;
  const walletAgeMs = Number.isFinite(walletTs) ? Math.max(0, nowMs - walletTs) : MAX_WALLET_DATA_AGE_MS + 1;

  const maxConfigured = Math.max(MAX_MARKET_DATA_AGE_MS, MAX_WALLET_DATA_AGE_MS);
  const freshness: DecisionFreshnessSnapshot = {
    marketAgeMs,
    walletAgeMs,
    maxAgeMs: maxConfigured,
    observedAt,
  };

  const sources = Array.from(
    new Set([`market:${market.source}`, `wallet:${wallet.source}`].filter(Boolean))
  );

  const evidenceRef: DecisionEvidenceRef = {
    marketRawHash: market.rawPayloadHash,
    walletRawHash: wallet.rawPayloadHash,
  };

  if (!market.poolId?.trim() || !market.baseToken?.trim() || !market.quoteToken?.trim()) {
    return {
      ok: false,
      blockedReason: "DATA_MISSING:market_fields_incomplete",
      reasonClass: "DATA_MISSING",
      sources,
      freshness,
      evidenceRef,
    };
  }

  if (!Number.isFinite(market.priceUsd) || market.priceUsd <= 0) {
    return {
      ok: false,
      blockedReason: "DATA_MISSING:market_price_invalid",
      reasonClass: "DATA_MISSING",
      sources,
      freshness,
      evidenceRef,
    };
  }

  if (!Array.isArray(wallet.balances)) {
    return {
      ok: false,
      blockedReason: "DATA_MISSING:wallet_balances_invalid",
      reasonClass: "DATA_MISSING",
      sources,
      freshness,
      evidenceRef,
    };
  }

  if (market.status === "stale" || market.freshnessMs > MAX_MARKET_DATA_AGE_MS || marketAgeMs > MAX_MARKET_DATA_AGE_MS) {
    return {
      ok: false,
      blockedReason: `DATA_STALE:market ageMs=${marketAgeMs} freshnessMs=${market.freshnessMs}`,
      reasonClass: "DATA_STALE",
      sources,
      freshness,
      evidenceRef,
    };
  }

  if (walletAgeMs > MAX_WALLET_DATA_AGE_MS) {
    return {
      ok: false,
      blockedReason: `DATA_STALE:wallet ageMs=${walletAgeMs}`,
      reasonClass: "DATA_STALE",
      sources,
      freshness,
      evidenceRef,
    };
  }

  if (market.status === "degraded") {
    return {
      ok: false,
      blockedReason: "DATA_DISAGREEMENT:market_status_degraded",
      reasonClass: "DATA_DISAGREEMENT",
      sources,
      freshness,
      evidenceRef,
    };
  }

  return {
    ok: true,
    sources,
    freshness,
    evidenceRef,
  };
}

export function hashSignalPackForEvidence(signalPack: unknown): string {
  return sha256(JSON.stringify(signalPack ?? {}));
}
