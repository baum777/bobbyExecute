import type {
  HealthResponse,
  SummaryResponse,
  AdaptersResponse,
  DecisionsResponse,
  MetricsResponse,
} from '@/types/api';

const now = () => new Date().toISOString();
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

export function mockHealth(): HealthResponse {
  return {
    status: 'OK',
    uptimeMs: 86400000 + Math.random() * 3600000,
    version: '0.1.0',
    killSwitch: { halted: false },
  };
}

export function mockSummary(): SummaryResponse {
  return {
    botStatus: 'running',
    riskScore: 0.18 + Math.random() * 0.1,
    chaosPassRate: 0.92 + Math.random() * 0.08,
    dataQuality: 0.85 + Math.random() * 0.15,
    lastDecisionAt: ago(Math.floor(Math.random() * 30000)),
    tradesToday: 37 + Math.floor(Math.random() * 10),
  };
}

export function mockAdapters(): AdaptersResponse {
  return {
    adapters: [
      {
        id: 'dexscreener',
        status: 'healthy',
        latencyMs: 95 + Math.floor(Math.random() * 60),
        lastSuccessAt: ago(2000),
        consecutiveFailures: 0,
      },
      {
        id: 'moralis',
        status: 'healthy',
        latencyMs: 140 + Math.floor(Math.random() * 80),
        lastSuccessAt: ago(3000),
        consecutiveFailures: 0,
      },
      {
        id: 'dexpaprika',
        status: 'degraded',
        latencyMs: 2200 + Math.floor(Math.random() * 500),
        lastSuccessAt: ago(18000),
        consecutiveFailures: 3,
      },
      {
        id: 'jupiter-quotes',
        status: 'healthy',
        latencyMs: 180 + Math.floor(Math.random() * 100),
        lastSuccessAt: ago(5000),
        consecutiveFailures: 0,
      },
      {
        id: 'solana-rpc',
        status: 'healthy',
        latencyMs: 60 + Math.floor(Math.random() * 40),
        lastSuccessAt: ago(1000),
        consecutiveFailures: 0,
      },
      {
        id: 'helius-rpc',
        status: 'down',
        latencyMs: 0,
        lastSuccessAt: ago(300000),
        consecutiveFailures: 12,
      },
    ],
  };
}

const TOKENS = ['SOL', 'BONK', 'WIF', 'JUP', 'PYTH', 'RAY', 'ORCA', 'MNDE'];
const REASONS_POOL = [
  'High liquidity confirmed',
  'Positive momentum detected',
  'Cross-source validation passed',
  'Low confidence score',
  'Risk threshold exceeded',
  'Stale price data',
  'MEV sandwich risk',
  'Pump velocity anomaly',
  'Circuit breaker open',
  'Chaos gate failed',
  'Pattern: steady_gainer',
  'Pattern: quick_runner',
  'Governance policy: max position cap',
  'Daily loss limit approaching',
];

export function mockDecisions(): DecisionsResponse {
  const actions: Array<'allow' | 'block' | 'abort'> = ['allow', 'block', 'abort'];
  const decisions = Array.from({ length: 25 }, (_, i) => {
    const action = actions[Math.floor(Math.random() * 3)];
    const reasonCount = action === 'allow' ? 2 : Math.floor(Math.random() * 3) + 1;
    const reasons: string[] = [];
    for (let r = 0; r < reasonCount; r++) {
      reasons.push(REASONS_POOL[Math.floor(Math.random() * REASONS_POOL.length)]);
    }
    return {
      id: `dec-${1000 + i}`,
      timestamp: ago(i * 45000 + Math.floor(Math.random() * 10000)),
      action,
      token: TOKENS[Math.floor(Math.random() * TOKENS.length)],
      confidence: action === 'allow' ? 0.7 + Math.random() * 0.3 : Math.random() * 0.6,
      reasons,
    };
  });
  return { decisions };
}

export function mockMetrics(): MetricsResponse {
  return {
    p95LatencyMs: {
      adapter: 120 + Math.floor(Math.random() * 50),
      quote: 75 + Math.floor(Math.random() * 30),
      swap: 190 + Math.floor(Math.random() * 60),
      rpc: 55 + Math.floor(Math.random() * 25),
      chaos: 40 + Math.floor(Math.random() * 20),
    },
  };
}
