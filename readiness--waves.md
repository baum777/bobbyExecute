# BobbyExecution: Migration Plan to Target-State Architecture

## 1. Executive Summary

**Current State:** 4.2/10 readiness - NOT ready for live test  
**Target State:** 8.5/10 readiness - Controlled live-test capable  
**Gap:** 31 identified gaps across 8 subsystems

**Top Blockers (must resolve before any live test):**
1. `executeSwap` throws "not implemented" for live trading
2. Quote service is stubbed (no Jupiter integration)
3. RPC defaults to stub mode (fake balances)
4. MEV/Sandwich scenario 15 is a stub
5. No bot-to-dashboard data bridge
6. No persistent action/decision logs
7. No bot-side kill switch
8. No 5xx retry in HTTP resilience

**Migration Strategy:** 8 waves, fail-closed by design, safety overrides features

---

## 2. Current State Reconstruction

### Architecture Map

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         CURRENT ARCHITECTURE                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ADAPTER LAYER              Status: Partial                                  │
│  ├── DexScreener           [FUNCTIONAL] - All endpoints wired                │
│  ├── DexPaprika            [FUNCTIONAL] - Token/pools wired                  │
│  ├── Moralis               [FUNCTIONAL] - EVM only, no Solana SPL            │
│  ├── HTTP Resilience       [FUNCTIONAL] - Retry on 429, missing 5xx          │
│  ├── DEX Execution         [STUBBED] - Paper only, live throws               │
│  │   ├── quotes.ts         [STUB] - Hardcoded 0.95x simulation               │
│  │   └── swap.ts           [STUB] - Throws on live path                      │
│  └── RPC Verify            [PARTIAL] - Real client wired, defaults stub      │
│      ├── client.ts         [FUNCTIONAL] - Mode dispatch works                │
│      ├── solana-web3-client.ts [PARTIAL] - Hardcoded decimals=9, SOL only    │
│      └── verify.ts         [FUNCTIONAL] - Pre/post checks wired              │
│                                                                              │
│  CORE ENGINE LAYER          Status: Functional                               │
│  ├── Scoring (MCI/BCI)     [FUNCTIONAL] - Age decay, hybrid weights          │
│  ├── Pattern Engine        [FUNCTIONAL] - All 8 patterns implemented         │
│  ├── Risk Models           [FUNCTIONAL] - 4 dimensions + aggregator          │
│  ├── Cross-Source Validator [FUNCTIONAL] - Confidence scoring                │
│  └── Token Universe        [FUNCTIONAL] - Builder + mapper                   │
│                                                                              │
│  GOVERNANCE LAYER           Status: Partial                                  │
│  ├── Circuit Breaker       [FUNCTIONAL] - Failure tracking, no time recovery │
│  ├── Chaos Suite           [PARTIAL] - Scenarios 12-14,16-19 real, rest stub │
│  │   ├── 1-11: Infrastructure/Data/Security/Performance [STUB]               │
│  │   ├── 12-14,16-19: Trading-Edge signals [REAL]                            │
│  │   └── 15: MEV/Sandwich [STUB]                                             │
│  ├── Risk Agent            [FUNCTIONAL] - Slippage, allowlist                │
│  ├── Policy Engine         [FUNCTIONAL] - Permissions, review gates          │
│  └── Guardrails            [FUNCTIONAL] - Feature flags, side-effects        │
│                                                                              │
│  EXECUTION LAYER            Status: Stubbed                                  │
│  ├── Execution Agent       [STUB] - Pass-through, no pre/post verify         │
│  └── Tool Router           [STUB] - No handlers implemented                  │
│                                                                              │
│  OBSERVABILITY LAYER        Status: In-Memory Only                           │
│  ├── Action Log            [MEMORY] - No persistence                         │
│  ├── Metrics               [MEMORY] - P95 only, no export                    │
│  ├── Health Check          [FUNCTIONAL] - CB state only                      │
│  ├── Logger                [FUNCTIONAL] - Pino to stdout                     │
│  └── Journal Writer        [PARTIAL] - FS writer exists, not auto-flush      │
│                                                                              │
│  PERSISTENCE LAYER          Status: Fragmented                               │
│  ├── Memory DB             [MEMORY] - Snappy + hash chain, no disk flush     │
│  ├── Idempotency Store     [MEMORY] - TTL support, no durability             │
│  └── Journal               [FILESYSTEM] - JSONL, O(n) reads                  │
│                                                                              │
│  SERVER LAYER               Status: MISSING                                  │
│  ├── HTTP Server           [MISSING] - No server exists                      │
│  ├── API Endpoints         [MISSING] - openapi.yaml defined, not implemented │
│  └── Dashboard Bridge      [MISSING] - No bot→dashboard data flow            │
│                                                                              │
│  TEST LAYER                 Status: Functional                               │
│  ├── Unit Tests            [FUNCTIONAL] - Core coverage                      │
│  ├── Golden Tasks          [FUNCTIONAL] - GT-001 to GT-018                   │
│  ├── Chaos Tests           [FUNCTIONAL] - 19 scenarios                       │
│  └── Integration/E2E       [MISSING] - No integration test suite             │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Implementation Status by Subsystem

| Subsystem | Implemented | Stubbed | Missing | Score |
|-----------|-------------|---------|---------|-------|
| Market Data Adapters | 3 | 0 | 0 | 8/10 |
| HTTP Resilience | 1 | 0 (5xx retry) | 0 | 7/10 |
| Scoring Engine | 1 | 0 | 0 | 9/10 |
| Pattern Engine | 1 | 0 | 0 | 9/10 |
| Risk Governance | 1 | 0 | 0 | 8/10 |
| Chaos Suite | 8 | 11 (scenarios 1-11,15) | 0 | 5/10 |
| Circuit Breaker | 1 | 0 (time recovery) | 0 | 8/10 |
| Execution (Quotes) | 0 | 1 | 0 | 2/10 |
| Execution (Swap) | 0 | 1 | 0 | 2/10 |
| RPC Verification | 1 | 1 (defaults) | 0 | 6/10 |
| Observability | 3 | 0 | 3 (persistence, export, bridge) | 4/10 |
| Persistence | 2 | 0 | 2 (durability, indexing) | 4/10 |
| Server/API | 0 | 0 | 1 | 0/10 |
| Dashboard Bridge | 0 | 0 | 1 | 0/10 |
| Kill Switch | 0 | 0 | 1 | 0/10 |
| **OVERALL** | | | | **4.2/10** |

### Documentation/Code Mismatches

| Document Claim | Code Reality | Severity |
|----------------|--------------|----------|
| `openapi.yaml` defines `/intent`, `/health`, `/journal` | No server implementation exists | CRITICAL |
| `recoveryTimeMs` in CB config | Never used in logic - only success resets | MEDIUM |
| `storagePath` in MemoryDB | Constructor accepts but never uses | MEDIUM |
| `HashiCorpVaultProvider` | Returns `undefined`, no Vault API | MEDIUM |
| `MonitorAgent` | Always returns `{healthy: true}` | LOW |
| Chaos scenarios test "adversarial conditions" | All inputs are benign (never trigger) | HIGH |

### Runtime Truth Gaps

| Expected | Actual |
|----------|--------|
| Live trading uses real DEX | Throws "not implemented" |
| Live trading uses real RPC | Defaults to stub unless explicitly set |
| Quotes reflect market prices | Hardcoded 0.95x simulation |
| MEV detection protects trades | Scenario 15 always passes |
| Dashboard shows bot decisions | Dashboard reads only legacy dor-bot |
| Action logs persist | In-memory only, lost on restart |
| Kill switch stops bot | Only exists in legacy dor-bot |

---

## 3. Target-State Gap Analysis

### Gap Matrix by Subsystem

| Subsystem | Current | Target | Gap | Severity | Dependency |
|-----------|---------|--------|-----|----------|------------|
| **MARKET DATA** |
| Adapter health reporting | Callback defined, never called | Called after every request | GAP-12 | HIGH | prerequisite |
| 5xx retry | Only 429 retried | 5xx retried with backoff | GAP-09 | HIGH | foundational |
| Freshness validation | None | Max 30s staleness enforced | GAP-11 | HIGH | prerequisite |
| Fallback cache | None | 60s TTL cache on failure | GAP-10 | HIGH | prerequisite |
| **EXECUTION** |
| Quote service | Stub (0.95x) | Jupiter Quote API | GAP-02 | CRITICAL | foundational |
| Swap execution | Throws on live | Jupiter swap + confirm | GAP-01 | CRITICAL | foundational |
| Route validation | None | Validate before execution | GAP-13 | HIGH | downstream |
| Simulation/preflight | None | Simulate before submit | GAP-15 | HIGH | downstream |
| Slippage enforcement | Declared only | Enforced at execution | GAP-14 | HIGH | downstream |
| **RPC VERIFICATION** |
| Default mode | Stub | Real enforced for live | GAP-03 | CRITICAL | foundational |
| SPL token balances | SOL only | SPL token support | GAP-19 | MEDIUM | prerequisite |
| Decimals from mint | Hardcoded 9 | Parse from chain | GAP-19 | MEDIUM | prerequisite |
| RPC failover | Single endpoint | Secondary fallback | GAP-18 | MEDIUM | parallelizable |
| **CHAOS/RISK** |
| MEV/Sandwich (15) | Stub | Real detection | GAP-04 | CRITICAL | prerequisite |
| Infrastructure (1-11) | Stubs | Basic implementation | GAP-05 | CRITICAL | parallelizable |
| Risk-chaos integration | Disconnected | Wired together | - | HIGH | downstream |
| **OBSERVABILITY** |
| Action log persistence | In-memory | JSONL filesystem | GAP-07 | CRITICAL | foundational |
| Metrics persistence | In-memory | Time-series store | GAP-28 | MEDIUM | parallelizable |
| Correlation IDs | Partial | Full propagation | GAP-26 | HIGH | prerequisite |
| **SERVER** |
| HTTP server | Missing | Fastify server | - | CRITICAL | foundational |
| KPI endpoints | Missing | /health, /kpi/* | GAP-08 | CRITICAL | downstream |
| Dashboard bridge | Missing | Bot→Python bridge | GAP-08 | CRITICAL | downstream |
| **SAFETY** |
| Kill switch | Missing | /emergency-stop API | GAP-06 | CRITICAL | foundational |
| Time-based CB recovery | Missing | Auto-recovery | - | MEDIUM | parallelizable |

### Blockers for Live Execution

| Blocker | Gap IDs | Resolution |
|---------|---------|------------|
| No real swap | GAP-01, GAP-02 | Wave 1 |
| RPC defaults fake | GAP-03 | Wave 1 |
| No 5xx retry | GAP-09 | Wave 1 |
| No MEV protection | GAP-04 | Wave 5 |
| No kill switch | GAP-06 | Wave 6 |

### Blockers for Bot-to-Dashboard Truth

| Blocker | Gap IDs | Resolution |
|---------|---------|------------|
| No server | - | Wave 3 |
| No KPI endpoints | GAP-08 | Wave 3 |
| No persistent logs | GAP-07 | Wave 4 |

### Blockers for Persistent Auditability

| Blocker | Gap IDs | Resolution |
|---------|---------|------------|
| Action log in-memory | GAP-07 | Wave 4 |
| Metrics in-memory | GAP-28 | Wave 4 |
| Journal not auto-flushed | - | Wave 4 |

### Blockers for Chaos Completion

| Blocker | Gap IDs | Resolution |
|---------|---------|------------|
| MEV scenario stub | GAP-04 | Wave 5 |
| Infrastructure stubs | GAP-05 | Wave 5 |

### Blockers for RPC Trust

| Blocker | Gap IDs | Resolution |
|---------|---------|------------|
| Default stub mode | GAP-03 | Wave 1 |
| SPL balance missing | GAP-19 | Wave 2 |
| Decimals hardcoded | GAP-19 | Wave 2 |
| No failover | GAP-18 | Wave 2 |

### Blockers for Runtime Halt Safety

| Blocker | Gap IDs | Resolution |
|---------|---------|------------|
| No kill switch | GAP-06 | Wave 6 |
| No time-based CB recovery | - | Wave 6 |

---

## 4. Migration Waves

### Wave 1 — Live Blockers (Week 1-2)
**Objective:** Enable safe live execution path

**Why This Wave Exists:** Without these, live trading is impossible or unsafe. The system must have real DEX integration, real RPC, and resilient HTTP before any capital can be at risk.

**Dependencies:** None - foundational

**File-Level Tasks:**

| File | Change | Priority |
|------|--------|----------|
| `bot/src/adapters/http-resilience.ts` | Add 5xx retry (3 retries, exponential backoff) | P0 |
| `bot/src/adapters/dex-execution/quotes.ts` | Implement Jupiter Quote API v6 | P0 |
| `bot/src/adapters/dex-execution/swap.ts` | Implement Jupiter swap execution | P0 |
| `bot/src/adapters/dex-execution/types.ts` | Add raw quote payload type | P0 |
| `bot/src/core/config/rpc.ts` | Enforce RPC_MODE=real for live trading | P0 |
| `bot/src/adapters/rpc-verify/client.ts` | Default to real when LIVE_TRADING=true | P0 |
| `bot/src/agents/execution.agent.ts` | Wire quote fetch + RPC verification | P0 |

**Contracts Affected:**
- `QuoteResult` - add raw payload field
- `ExecutionPlan` - wire quote integration
- `ExecutionReport` - add actualAmountOut from chain

**Test Requirements:**
- Unit: Jupiter quote parsing, swap response handling
- Integration: Quote → Swap flow with mocked Jupiter
- Safety: Live trading blocked without RPC_MODE=real

**Exit Criteria:**
- [ ] `npm run test:golden` passes
- [ ] `npm run test:chaos` passes
- [ ] Jupiter quote returns real price data (mocked in tests)
- [ ] Swap execution succeeds in paper mode
- [ ] Swap execution throws clear error if RPC_MODE=stub with LIVE_TRADING=true

---

### Wave 2 — Market Truth & Reliability (Week 2-3)
**Objective:** Reliable market data with freshness, fallback, and health visibility

**Why This Wave Exists:** Live trading requires trustworthy market data. Stale, failed, or unverified adapter data must not reach the scoring engine.

**Dependencies:** Wave 1 (execution needs reliable data)

**File-Level Tasks:**

| File | Change | Priority |
|------|--------|----------|
| `bot/src/adapters/adapters-with-cb.ts` | Call health callback after requests | P1 |
| `bot/src/adapters/dexpaprika/client.ts` | Add freshness validation | P1 |
| `bot/src/adapters/dexscreener/client.ts` | Add freshness validation | P1 |
| `bot/src/adapters/moralis/client.ts` | Add freshness validation | P1 |
| `bot/src/adapters/` | Implement 60s TTL fallback cache | P1 |
| `bot/src/adapters/rpc-verify/solana-web3-client.ts` | Implement SPL token balance query | P1 |
| `bot/src/adapters/rpc-verify/solana-web3-client.ts` | Parse real decimals from mint | P1 |
| `bot/src/adapters/rpc-verify/client.ts` | Add secondary RPC endpoint | P2 |
| `bot/src/core/validate/cross-source-validator.ts` | Enhance confidence scoring | P2 |

**Contracts Affected:**
- `MarketSnapshot` - add freshnessMs field
- `AdapterHealth` - add freshnessAgeMs field

**Test Requirements:**
- Unit: Freshness rejection, cache hit/miss
- Integration: Adapter fallback on failure
- Chaos: Stale data scenario (scenario 5) now has real detection

**Exit Criteria:**
- [ ] Adapter health visible after every request
- [ ] Stale data (>30s) rejected or degraded
- [ ] Cache returns data on adapter failure
- [ ] SPL token balances queryable
- [ ] Token decimals read from chain

---

### Wave 3 — Runtime Visibility & Dashboard Bridge (Week 3-4)
**Objective:** Bot runtime state visible on dashboard

**Why This Wave Exists:** Operators cannot safely manage what they cannot see. The dashboard must reflect real bot decisions, not legacy dor-bot state.

**Dependencies:** Wave 1 (execution state to expose), Wave 2 (adapter health to expose)

**File-Level Tasks:**

| File | Change | Priority |
|------|--------|----------|
| `bot/src/server/index.ts` | Create Fastify server | P0 |
| `bot/src/server/routes/health.ts` | Implement GET /health | P0 |
| `bot/src/server/routes/kpi.ts` | Implement GET /kpi/summary | P0 |
| `bot/src/server/routes/kpi.ts` | Implement GET /kpi/decisions | P0 |
| `bot/src/server/routes/kpi.ts` | Implement GET /kpi/adapters | P0 |
| `bot/src/server/routes/kpi.ts` | Implement GET /kpi/metrics | P1 |
| `bot/package.json` | Add server start script | P0 |
| `dor-bot/dor-bot/metrics/bridge.py` | Create TS→Python bridge | P1 |
| `dor-bot/dor-bot/server.py` | Consume bot KPIs when available | P1 |

**Contracts Affected:**
- `HealthResponse` (new)
- `KpiSummaryResponse` (new)
- `KpiDecisionsResponse` (new)
- `KpiAdaptersResponse` (new)

**Test Requirements:**
- Unit: Route handlers
- Integration: Server startup, endpoint responses
- E2E: Dashboard shows bot data

**Exit Criteria:**
- [ ] Server starts and responds to /health
- [ ] /kpi/summary returns bot status
- [ ] /kpi/decisions returns recent decisions
- [ ] /kpi/adapters returns adapter health
- [ ] Dashboard consumes bot KPIs via bridge

---

### Wave 4 — Persistent Observability & State (Week 4-5)
**Objective:** Audit logs survive restart, metrics queryable

**Why This Wave Exists:** Regulatory and operational requirements demand durable audit trails. In-memory logs are insufficient for production.

**Dependencies:** Wave 3 (server to query persisted data)

**File-Level Tasks:**

| File | Change | Priority |
|------|--------|----------|
| `bot/src/observability/action-log.ts` | Implement FileSystemActionLogger | P0 |
| `bot/src/observability/metrics.ts` | Add time-series persistence | P1 |
| `bot/src/memory/memory-db.ts` | Implement storagePath flush | P1 |
| `bot/src/journal-writer/writer.ts` | Auto-start periodic flush | P1 |
| `bot/src/storage/inmemory-kv.ts` | Add file-backed idempotency option | P2 |
| `bot/src/observability/logger.ts` | Add file transport | P2 |

**Contracts Affected:**
- `StructuredLog` (new)
- `MetricsSnapshot` (new)

**Test Requirements:**
- Unit: File write/read, rotation
- Integration: Log persistence across restart
- E2E: Query historical decisions

**Exit Criteria:**
- [ ] Action logs written to JSONL files
- [ ] Metrics persisted with timestamps
- [ ] MemoryDB flushes to disk
- [ ] Journal auto-flushes periodically
- [ ] Logs queryable via API

---

### Wave 5 — Chaos / Risk Completion (Week 5-6)
**Objective:** Full chaos coverage, MEV protection, risk-chaos integration

**Why This Wave Exists:** Category 5 chaos failures abort trading. MEV/sandwich attacks are a critical threat that must be detected.

**Dependencies:** Wave 2 (market data for chaos signals), Wave 4 (logging for chaos reports)

**File-Level Tasks:**

| File | Change | Priority |
|------|--------|----------|
| `bot/src/chaos/signals/mev-sandwich.ts` | Create MEV detection signal | P0 |
| `bot/src/chaos/chaos-suite.ts` | Implement scenario 15 with real logic | P0 |
| `bot/src/chaos/chaos-suite.ts` | Implement scenarios 1-6 | P1 |
| `bot/src/chaos/signals/` | Add time-windowed detection | P2 |
| `bot/src/chaos/signals/pump-velocity.ts` | Make thresholds configurable | P2 |
| `bot/src/core/risk/global-risk.ts` | Wire chaos results to risk scoring | P2 |
| `bot/src/governance/chaos-gate.ts` | Add timeout protection | P2 |

**Contracts Affected:**
- `ChaosReport` - add MEV evidence
- `RiskEvaluation` - add chaos result reference

**Test Requirements:**
- Unit: MEV detection with simulated mempool data
- Chaos: Scenario 15 triggers abort on sandwich pattern
- Integration: Chaos result affects risk decision

**Exit Criteria:**
- [ ] MEV scenario detects sandwich attacks
- [ ] Scenarios 1-6 have basic detection logic
- [ ] Chaos results wired to risk evaluation
- [ ] Chaos gate has timeout protection

---

### Wave 6 — Runtime Safety & Kill Switch (Week 6-7)
**Objective:** Emergency halt capability, automatic recovery

**Why This Wave Exists:** Capital protection requires immediate stop capability and graceful degradation.

**Dependencies:** Wave 3 (server for kill switch endpoint), Wave 5 (chaos for abort conditions)

**File-Level Tasks:**

| File | Change | Priority |
|------|--------|----------|
| `bot/src/governance/kill-switch.ts` | Create kill switch module | P0 |
| `bot/src/server/routes/control.ts` | Implement POST /emergency-stop | P0 |
| `bot/src/governance/circuit-breaker.ts` | Add time-based recovery | P1 |
| `bot/src/core/engine.ts` | Add global error escalation | P1 |
| `bot/src/core/orchestrator.ts` | Add halt condition checks | P1 |

**Contracts Affected:**
- `KillSwitchState` (new)
- `EmergencyStopRequest` (new)

**Test Requirements:**
- Unit: Kill switch trigger, CB time recovery
- Integration: Emergency stop halts trading
- E2E: Kill switch accessible from dashboard

**Exit Criteria:**
- [ ] POST /emergency-stop halts all trading
- [ ] Kill switch requires manual reset
- [ ] Circuit breaker auto-recovers after timeout
- [ ] Global errors escalate to halt

---

### Wave 7 — Integration / E2E Validation (Week 7-8)
**Objective:** Full pipeline validation, determinism checks, dry-run/live parity

**Why This Wave Exists:** Individual component tests are insufficient. The full pipeline must be validated end-to-end.

**Dependencies:** All previous waves

**File-Level Tasks:**

| File | Change | Priority |
|------|--------|----------|
| `bot/tests/integration/adapters.test.ts` | Create adapter integration suite | P0 |
| `bot/tests/integration/execution.test.ts` | Create execution integration suite | P0 |
| `bot/tests/integration/chaos.test.ts` | Create chaos integration suite | P0 |
| `bot/tests/e2e/full-pipeline.test.ts` | Create E2E pipeline test | P0 |
| `bot/tests/e2e/determinism.test.ts` | Create determinism validation | P0 |
| `bot/tests/e2e/fail-closed.test.ts` | Create fail-closed validation | P0 |

**Test Requirements:**
- Integration: Component wiring, error propagation
- E2E: Full pipeline from market data to execution
- Determinism: Same input → same output + hash
- Fail-closed: Every abort condition tested

**Exit Criteria:**
- [ ] Integration tests cover all adapters
- [ ] E2E test runs full pipeline
- [ ] Determinism checks pass
- [ ] All abort conditions tested
- [ ] `npm run premerge` passes

---

### Wave 8 — Controlled Live Test Readiness (Week 8+)
**Objective:** System ready for limited capital live testing

**Why This Wave Exists:** The final validation before real capital is at risk.

**Dependencies:** Wave 7 (all validation complete)

**File-Level Tasks:**

| File | Change | Priority |
|------|--------|----------|
| `bot/src/config/safety.ts` | Add live-test mode config | P0 |
| `bot/src/core/engine.ts` | Add daily loss tracking | P0 |
| `docs/bobbyexecution/` | Update runbooks for live test | P1 |
| `bot/scripts/live-test-checklist.sh` | Create pre-flight checklist | P1 |

**Exit Criteria:**
- [ ] All waves 1-7 complete
- [ ] Re-audit score >= 8.5/10
- [ ] Dry run successful (1 week)
- [ ] Shadow mode successful (1 week)
- [ ] Go/no-go decision documented

---

## 5. File-Level Implementation Plan

### Critical Path Files

| File Path | Current Role | Required Change | Why | Priority | Validation |
|-----------|--------------|-----------------|-----|----------|------------|
| `bot/src/adapters/http-resilience.ts` | HTTP retry logic | Add 5xx retry with 3 attempts | Live trading requires resilient HTTP | P0 | Test: 5xx triggers retry |
| `bot/src/adapters/dex-execution/quotes.ts` | Quote stub | Jupiter Quote API v6 integration | Real quotes required for live trading | P0 | Test: Quote has real price |
| `bot/src/adapters/dex-execution/swap.ts` | Swap stub | Jupiter swap execution | Real swaps required for live trading | P0 | Test: Live swap succeeds |
| `bot/src/adapters/dex-execution/types.ts` | Type definitions | Add raw quote payload | Quote must flow to swap | P0 | Type check passes |
| `bot/src/core/config/rpc.ts` | RPC config | Enforce RPC_MODE=real for live | Prevent fake RPC in live mode | P0 | Test: Live blocked with stub |
| `bot/src/adapters/rpc-verify/client.ts` | RPC factory | Default to real when LIVE_TRADING | Ensure real RPC used | P0 | Test: Correct client returned |
| `bot/src/agents/execution.agent.ts` | Execution handler | Wire quote + verification | Full execution pipeline | P0 | Integration test passes |
| `bot/src/adapters/adapters-with-cb.ts` | CB wrapper | Call health callback | Adapter health visibility | P1 | Health recorded after request |
| `bot/src/adapters/dexpaprika/client.ts` | Market adapter | Add freshness validation | Reject stale data | P1 | Test: Stale data rejected |
| `bot/src/adapters/dexscreener/client.ts` | Market adapter | Add freshness validation | Reject stale data | P1 | Test: Stale data rejected |
| `bot/src/adapters/moralis/client.ts` | Market adapter | Add freshness validation | Reject stale data | P1 | Test: Stale data rejected |
| `bot/src/adapters/rpc-verify/solana-web3-client.ts` | RPC client | SPL token balance support | Verify token balances | P1 | Test: SPL balance returned |
| `bot/src/adapters/rpc-verify/solana-web3-client.ts` | RPC client | Parse decimals from mint | Correct decimal handling | P1 | Test: USDC returns 6 |
| `bot/src/server/index.ts` | **MISSING** | Create Fastify server | Runtime visibility | P0 | Server starts |
| `bot/src/server/routes/health.ts` | **MISSING** | Implement /health | Health endpoint | P0 | Returns status |
| `bot/src/server/routes/kpi.ts` | **MISSING** | Implement /kpi/* | KPI endpoints | P0 | Returns data |
| `bot/src/observability/action-log.ts` | In-memory logger | FileSystemActionLogger | Persistent audit log | P0 | Logs written to file |
| `bot/src/chaos/signals/mev-sandwich.ts` | **MISSING** | MEV detection signal | Protect against MEV | P0 | Detects sandwich |
| `bot/src/chaos/chaos-suite.ts` | Scenario runner | Implement scenario 15 | MEV protection | P0 | Scenario 15 aborts on MEV |
| `bot/src/governance/kill-switch.ts` | **MISSING** | Kill switch module | Emergency stop | P0 | Halt works |
| `bot/src/server/routes/control.ts` | **MISSING** | POST /emergency-stop | Emergency endpoint | P0 | Endpoint halts trading |
| `dor-bot/dor-bot/metrics/bridge.py` | **MISSING** | TS→Python bridge | Dashboard integration | P1 | Bot data on dashboard |

---

## 6. Contracts and Artifacts Required

### Core Contracts (Validate Implementation)

| Contract | Purpose | Producer | Consumer | Persistence | Validation |
|----------|---------|----------|----------|-------------|------------|
| `MarketSnapshot` | Canonical market data | Adapters | Scoring, Risk | Journal | Zod schema |
| `ScoreCard` | MCI/BCI/Hybrid scores | Scoring Engine | Signal, Risk | Journal | Zod schema |
| `RiskEvaluation` | Risk decision | Risk Engine | Execution | Action Log | Zod schema |
| `ChaosReport` | Chaos suite results | Chaos Suite | Risk, Governance | Action Log | Zod schema |
| `ExecutionIntent` | Validated trade intent | Risk Engine | Execution | Journal | Zod schema |
| `ExecutionReport` | Trade result | Execution | Verification, Journal | Journal | Zod schema |
| `RpcVerificationReport` | RPC check results | RPC Verify | Execution | Action Log | Zod schema |
| `AdapterHealth` | Adapter status | Adapters | Circuit Breaker, KPI | Metrics DB | Interface |
| `StructuredLog` | Audit log entry | All stages | Action Logger | JSONL | Zod schema |
| `KpiSummaryResponse` | Dashboard data | Server | Dashboard | - | Zod schema |
| `KpiDecisionsResponse` | Decision history | Server | Dashboard | - | Zod schema |
| `KpiAdaptersResponse` | Adapter health | Server | Dashboard | - | Zod schema |

### New Contracts Required

```typescript
// bot/src/server/contracts/kpi.ts
interface KpiSummaryResponse {
  botStatus: "running" | "paused" | "stopped";
  riskScore: number;
  chaosPassRate: number;
  dataQuality: number;
  lastDecisionAt: string;
  tradesToday: number;
}

interface KpiDecisionsResponse {
  decisions: Array<{
    id: string;
    timestamp: string;
    action: "allow" | "block" | "abort";
    token: string;
    confidence: number;
    reasons: string[];
  }>;
}

interface KpiAdaptersResponse {
  adapters: Array<{
    id: string;
    status: "healthy" | "degraded" | "down";
    latencyMs: number;
    lastSuccessAt: string;
    consecutiveFailures: number;
  }>;
}
```

---

## 7. Fail-Closed Failure Handling Model

### Stop Conditions (Trading Halts)

| Condition | Detection | Action | Alert |
|-----------|-----------|--------|-------|
| All market adapters down | Circuit breaker open on all | Halt trading, enter recovery | CRITICAL |
| RPC verification fails 3x consecutive | RPC verify returns false | Halt trading, alert operator | CRITICAL |
| Chaos Category 5 failure | Scenario 12-19 returns hit | Abort trade, halt if persistent | CRITICAL |
| Daily loss limit reached | Loss tracking >= limit | Halt trading, manual review | HIGH |
| Kill switch triggered | API call or automatic | Immediate halt all activity | EMERGENCY |
| All circuit breakers open | No healthy adapters | Halt, wait for recovery | HIGH |
| MEV attack detected | Scenario 15 hit | Abort trade, alert | CRITICAL |
| Slippage exceeded | actual > max in intent | Abort trade, alert | HIGH |

### Degrade Conditions (Reduced Functionality)

| Condition | Detection | Action |
|-----------|-----------|--------|
| Single adapter down | CB open on one adapter | Use fallback cache, reduce confidence |
| Freshness degraded | Data >15s but <30s old | Degrade signal confidence |
| Risk score elevated | Aggregate >0.6 | Reduce position size |
| Chaos pass rate 95-98% | Pass rate <98% but >95% | Log warning, continue with caution |

### Manual Review Conditions

| Condition | Detection | Action |
|-----------|-----------|--------|
| Novel pattern detected | Pattern engine unknown match | Queue for review |
| Large position request | >50% of max position size | Require approval |
| First trade of day | Daily trade count = 0 | Enhanced logging |

### Block Conditions (Single Trade Blocked)

| Condition | Detection | Action |
|-----------|-----------|--------|
| Token denylisted | Denylist check | Block, log reason |
| Slippage > max | Quote slippage check | Block, request new quote |
| Insufficient balance | RPC balance check | Block, alert |
| Token not allowlisted | Allowlist check (if enabled) | Block, log reason |
| Idempotency key seen | Idempotency store | Block as duplicate |

### Retry Conditions

| Condition | Retry Strategy | Max Attempts |
|-----------|----------------|--------------|
| 5xx error | Exponential backoff | 3 |
| 429 error | Retry-After header | 3 |
| Network timeout | Exponential backoff | 3 |
| RPC transient failure | Immediate retry | 2 |
| Quote expired | Re-quote immediately | 1 |

### Operator Alert Conditions

| Severity | Condition | Channel |
|----------|-----------|---------|
| EMERGENCY | Kill switch triggered | SMS + Pager + Dashboard |
| CRITICAL | Trading halted | Pager + Dashboard |
| HIGH | Daily loss >50% | Email + Dashboard |
| MEDIUM | Adapter degraded | Dashboard |
| LOW | Cache miss | Logs only |

---

## 8. Validation and Test Gates

### Minimum Unit Coverage

| Module | Coverage Target | Critical Paths |
|--------|-----------------|----------------|
| Adapters | 80% | Retry logic, freshness, mapping |
| Scoring | 90% | MCI/BCI formulas, hybrid weights |
| Risk | 85% | All risk dimensions, aggregation |
| Chaos | 80% | Signal detection, abort logic |
| Execution | 90% | Quote, swap, verification |
| Governance | 85% | Circuit breaker, policies |
| Observability | 75% | Logging, metrics, health |

### Critical Integration Tests

| Test | Description | Success Criteria |
|------|-------------|------------------|
| Adapter → CB → Health | Adapter failure propagates to health | Health reflects failure |
| Quote → Route → Swap | Full execution flow | Swap uses quote data |
| Risk → Chaos → Decision | Risk evaluation includes chaos | Chaos hit blocks trade |
| RPC Pre → Swap → RPC Post | Verification sandwich | Both verifications pass |
| Market → Score → Signal → Risk | Full pipeline | Decision produced |

### Required E2E Flows

| Flow | Description | Validation |
|------|-------------|------------|
| Happy path | Market → Signal → Risk → Execute → Verify → Log | All stages succeed |
| Risk block | Risk policy violation | Trade blocked, logged |
| Chaos abort | Category 5 failure | Trade aborted, alerted |
| Adapter failure | All adapters down | Trading halted |
| Kill switch | Emergency stop triggered | All activity stops |

### Determinism Checks

| Check | Method | Validation |
|-------|--------|------------|
| Same input → same output | Replay test | Output identical |
| Hash chain integrity | Verify chain | No tampering detected |
| Trace ID propagation | Inject trace | Same trace at all stages |
| Decision hash | Canonicalize | Deterministic hash |

### Dry-Run vs Live-Path Parity

| Aspect | Dry Run | Live | Parity Check |
|--------|---------|------|--------------|
| Quote | Simulated | Jupiter | Same structure |
| Risk check | Full | Full | Identical logic |
| Chaos gate | Full | Full | Identical scenarios |
| Execution | Simulated | Real | Same verification |
| Logging | Full | Full | Same persistence |

### Dashboard Truth Checks

| Check | Method | Validation |
|-------|--------|------------|
| Decision count | Compare bot log vs dashboard | Match |
| Adapter health | Compare CB state vs dashboard | Match |
| Chaos pass rate | Compare suite result vs dashboard | Match |
| Trade history | Compare journal vs dashboard | Match |

### Kill Switch Validation

| Test | Method | Success |
|------|--------|---------|
| API trigger | POST /emergency-stop | Trading halts within 1s |
| Automatic trigger | Chaos EMERGENCY severity | Trading halts |
| Reset requires manual | Attempt auto-resume | Fails without operator |

### RPC Verification Validation

| Test | Method | Success |
|------|--------|---------|
| Pre-trade token check | Invalid mint | Blocked |
| Pre-trade balance check | Insufficient funds | Blocked |
| Post-trade confirmation | Tx not found | Flagged |
| Post-trade amount check | Actual < expected | Flagged |

### Chaos Abort Validation

| Scenario | Trigger | Expected |
|----------|---------|----------|
| Cross-DEX divergence | 25% price spread | Abort |
| Liquidity drain | 35% drop | Abort |
| Pump velocity | 60% pump, 5% holders, 4x volume | Abort |
| MEV sandwich | Front-run + back-run detected | Abort |

### Phase Gate Criteria

| Gate | Entry Criteria | Exit Criteria |
|------|----------------|---------------|
| Wave 1 | None | All P0 tasks complete, tests pass |
| Wave 2 | Wave 1 complete | Adapter health visible, freshness enforced |
| Wave 3 | Wave 2 complete | Server responds, KPIs exposed |
| Wave 4 | Wave 3 complete | Logs persist, metrics queryable |
| Wave 5 | Wave 4 complete | MEV detection works, scenarios 1-6 real |
| Wave 6 | Wave 5 complete | Kill switch tested, CB recovery works |
| Wave 7 | Wave 6 complete | Integration tests pass, E2E passes |
| Wave 8 | Wave 7 complete | Re-audit >= 8.5/10 |

### Re-Audit Trigger Points

| Trigger | Action |
|---------|--------|
| Any Wave 1-6 P0 task delayed | Re-assess timeline |
| Test failure in Wave 7 | Root cause, fix, re-test |
| Security review findings | Address before Wave 8 |
| Performance benchmark fail | Optimize before Wave 8 |

### Final Go/No-Go Checks (Before Stage 3 Limited Capital)

| Check | Criteria | Owner |
|-------|----------|-------|
| Re-audit score | >= 8.5/10 | Readiness Auditor |
| All waves complete | 1-7 done | Planner |
| Test coverage | >= 80% all modules | Test Architect |
| Dry run | 1 week successful | Operations |
| Shadow mode | 1 week successful | Operations |
| Kill switch tested | Confirmed working | Runtime Safety Engineer |
| Documentation updated | Runbooks current | Documentation |
| Capital limits configured | Max 100 USD | Risk Engineer |
| Monitoring dashboards | All KPIs visible | Observability Engineer |
| Rollback plan | Documented | Planner |

---

## 9. Controlled Live-Test Readiness Model

### Stage 1 — Dry Run (Week 1)

| Aspect | Specification |
|--------|---------------|
| **Entry Criteria** | Wave 1-4 complete, server operational |
| **Capital** | $0 (no real transactions) |
| **Execution** | Paper mode only |
| **Market Data** | Live adapters |
| **Monitoring** | Full observability |
| **Success Criteria** | All decisions logged, no errors |
| **Stop Conditions** | Any error, any unexpected behavior |

### Stage 2 — Shadow Mode (Week 2)

| Aspect | Specification |
|--------|---------------|
| **Entry Criteria** | Stage 1 successful, Wave 5 complete |
| **Capital** | $0 (simulated execution) |
| **Execution** | Quote + simulate, no submit |
| **Market Data** | Live adapters |
| **Monitoring** | Compare simulated vs expected |
| **Success Criteria** | Simulation accuracy >95% |
| **Stop Conditions** | Accuracy <90%, any chaos hit |

### Stage 3 — Limited Capital (Weeks 3-4)

| Aspect | Specification |
|--------|---------------|
| **Entry Criteria** | Stage 2 successful, all waves complete, go/no-go passed |
| **Capital** | Max $100 USD |
| **Trade Limit** | Max 1 trade per day |
| **Execution** | Live swaps with full verification |
| **Monitoring** | Real-time dashboard, alerts |
| **Success Criteria** | <10% drawdown, profitable trades |
| **Rollback Triggers** | 2 consecutive losses, daily loss >50%, any critical alert |

### Stage 4 — Expanded Testing (Weeks 5-6)

| Aspect | Specification |
|--------|---------------|
| **Entry Criteria** | Stage 3 successful, 2 weeks profitable |
| **Capital** | Max $500 USD |
| **Trade Limit** | Max 3 trades per day |
| **Execution** | Live swaps |
| **Monitoring** | Relaxed monitoring, daily review |
| **Success Criteria** | Profitable, chaos gate stable |
| **Stop Conditions** | Any Stage 3 rollback trigger |

---

## 10. Final Recommended Execution Sequence

### Immediate Actions (Today)

1. **Create branch** `feat/wave-1-live-blockers`
2. **Implement 5xx retry** in `http-resilience.ts` (2 hours)
3. **Implement Jupiter Quote API** in `quotes.ts` (4 hours)
4. **Implement Jupiter swap** in `swap.ts` (6 hours)
5. **Enforce RPC_MODE=real** in `safety.ts` (1 hour)
6. **Run tests**: `npm run premerge`
7. **Merge** to main

### Week 1-2: Wave 1 Completion
- Complete all Wave 1 tasks
- Daily standup on blockers
- End-of-wave re-audit

### Week 2-3: Wave 2 Completion
- Market data reliability
- RPC improvements

### Week 3-4: Wave 3 Completion
- Server implementation
- Dashboard bridge

### Week 4-5: Wave 4 Completion
- Persistent observability

### Week 5-6: Wave 5 Completion
- Chaos completion
- MEV detection

### Week 6-7: Wave 6 Completion
- Kill switch
- Runtime safety

### Week 7-8: Wave 7 Completion
- Integration tests
- E2E validation

### Week 8+: Wave 8 / Live Test
- Dry run (1 week)
- Shadow mode (1 week)
- Limited capital (2 weeks)
- Expanded testing (2 weeks)

### Critical Path Summary

```
Week 1: 5xx retry → Jupiter quote → Jupiter swap → RPC enforce
Week 2: Adapter health → Freshness → SPL balances → Decimals
Week 3: Fastify server → /health → /kpi/* → Dashboard bridge
Week 4: FileSystemActionLogger → Metrics persistence → Auto-flush
Week 5: MEV signal → Scenario 15 → Scenarios 1-6
Week 6: Kill switch → /emergency-stop → CB time recovery
Week 7: Integration tests → E2E tests → Determinism checks
Week 8+: Dry run → Shadow mode → Limited capital
```

### Top Blockers to Monitor

| Blocker | Mitigation |
|---------|------------|
| Jupiter API changes | Pin API version, monitor changelog |
| RPC rate limits | Implement backoff, secondary endpoint |
| Dashboard bridge complexity | Start with polling, add WebSocket later |
| MEV detection complexity | Use mempool monitoring service |

### Success Metrics

| Metric | Target |
|--------|--------|
| Re-audit score | >= 8.5/10 |
| Test coverage | >= 80% |
| Dry run uptime | 100% |
| Shadow accuracy | >= 95% |
| Limited capital drawdown | < 10% |
| Kill switch response | < 1s |

---

This migration plan provides a deterministic, implementation-ready blueprint for transforming BobbyExecution from 4.2/10 to 8.5/10 readiness. Each wave has clear objectives, file-level tasks, exit criteria, and validation gates. The plan prioritizes safety over features and maintains fail-closed principles throughout.
