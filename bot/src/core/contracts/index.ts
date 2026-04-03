/**
 * Core contracts compatibility barrel.
 * @deprecated compatibility-only legacy barrel.
 * Zero-authority residue only. Not part of the canonical BobbyExecute v2 authority path.
 * Retained temporarily for migration/test support only; no new production callers.
 */
export * from "./agent.js";
export * from "./dataquality.js";
export * from "./decision-envelope.js";
export * from "./decision.js";
export * from "./decisionresult.js";
export * from "./intent.js";
export * from "./journal.js";
export * from "./market.js";
export * from "./pattern.js";
/** @deprecated migration target: `intelligence/scoring/contracts/score-card.v1.ts`. */
export * from "./scorecard.js";
/** @deprecated migration target: `intelligence/signals/contracts/constructed-signal-set.v1.ts`. */
export * from "./signalpack.js";
export * from "./trade.js";
export * from "./wallet.js";
export * from "./cqd.js";
/** @deprecated migration target: `intelligence/universe/contracts/universe-build-result.ts`. */
export * from "./tokenuniverse.js";
