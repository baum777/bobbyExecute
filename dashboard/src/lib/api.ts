import type {
  HealthResponse,
  SummaryResponse,
  AdaptersResponse,
  DecisionsResponse,
  DecisionAdvisoryResponse,
  MetricsResponse,
  DashboardLoginRequest,
  DashboardLoginResponse,
  DashboardLogoutResponse,
  DashboardOperatorAuthState,
  ControlStatusResponse,
  EmergencyStopResponse,
  WorkerRestartDeliveryQuery,
  RestartAlertActionRequest,
  RestartAlertActionResponse,
  RestartAlertListResponse,
  WorkerRestartDeliveryJournalResponse,
  WorkerRestartDeliverySummaryResponse,
  WorkerRestartDeliveryTrendQuery,
  WorkerRestartDeliveryTrendResponse,
  RestartWorkerRequest,
  RestartWorkerResponse,
  ResetResponse,
  LivePromotionDecisionBody,
  LivePromotionListResponse,
  LivePromotionRecord,
  LivePromotionRequestBody,
  LivePromotionTargetMode,
} from '../types/api';
import { API_BASE, USE_MOCK } from './constants';
import {
  mockHealth,
  mockSummary,
  mockAdapters,
  mockDecisions,
  mockMetrics,
  mockControlStatus,
  mockDashboardLogin,
  mockDashboardLogout,
  mockDashboardSession,
  mockRestartAlerts,
  mockRestartWorker,
  mockRestartAlertDeliveries,
  mockRestartAlertDeliverySummary,
  mockRestartAlertDeliveryTrends,
  mockLivePromotions,
  mockRequestLivePromotion,
  mockApproveLivePromotion,
  mockDenyLivePromotion,
  mockApplyLivePromotion,
  mockRollbackLivePromotion,
} from './mock-data';

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

function buildDeliveryQueryString(query: WorkerRestartDeliveryQuery = {}): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value == null || value === '') {
      continue;
    }
    params.set(key, String(value));
  }
  const encoded = params.toString();
  return encoded ? `?${encoded}` : '';
}

function normalizeRequestBody(body: BodyInit | null | undefined): BodyInit | undefined {
  if (typeof body === 'string' && body.length === 0) {
    return undefined;
  }

  return body ?? undefined;
}

function buildJsonRequestInit(options?: RequestInit): RequestInit {
  const body = normalizeRequestBody(options?.body);
  const headers = new Headers(options?.headers);

  if (body !== undefined && !headers.has('content-type')) {
    headers.set('Content-Type', 'application/json');
  }

  return {
    ...options,
    body,
    headers,
  };
}

async function fetchApi<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...buildJsonRequestInit(options),
  });

  if (!response.ok) {
    const text = await response.text();
    let message = `${response.status} ${response.statusText}`;
    if (text) {
      try {
        const payload = JSON.parse(text) as { message?: unknown };
        if (typeof payload.message === 'string' && payload.message.trim()) {
          message = payload.message;
        }
      } catch {
        message = text;
      }
    }
    throw new ApiError(response.status, message);
  }

  return response.json();
}

async function fetchProxyApi<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`/api/control${path}`, {
    ...buildJsonRequestInit(options),
  });

  if (!response.ok) {
    const text = await response.text();
    let message = `${response.status} ${response.statusText}`;
    if (text) {
      try {
        const payload = JSON.parse(text) as { message?: unknown };
        if (typeof payload.message === 'string' && payload.message.trim()) {
          message = payload.message;
        }
      } catch {
        message = text;
      }
    }
    throw new ApiError(response.status, message);
  }

  return response.json();
}

async function fetchAuthApi<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`/api/auth${path}`, {
    ...buildJsonRequestInit(options),
  });

  if (!response.ok) {
    const text = await response.text();
    let message = `${response.status} ${response.statusText}`;
    if (text) {
      try {
        const payload = JSON.parse(text) as { reason?: unknown; message?: unknown };
        if (typeof payload.reason === 'string' && payload.reason.trim()) {
          message = payload.reason;
        } else if (typeof payload.message === 'string' && payload.message.trim()) {
          message = payload.message;
        }
      } catch {
        message = text;
      }
    }
    throw new ApiError(response.status, message);
  }

  return response.json();
}

function buildLivePromotionQueryString(targetMode: LivePromotionTargetMode): string {
  const params = new URLSearchParams();
  params.set('targetMode', targetMode);
  return `?${params.toString()}`;
}

export const api = {
  health: (): Promise<HealthResponse> =>
    USE_MOCK ? Promise.resolve(mockHealth()) : fetchApi('/health'),

  summary: (): Promise<SummaryResponse> =>
    USE_MOCK ? Promise.resolve(mockSummary()) : fetchApi('/kpi/summary'),

  adapters: (): Promise<AdaptersResponse> =>
    USE_MOCK ? Promise.resolve(mockAdapters()) : fetchApi('/kpi/adapters'),

  decisions: (limit = 50): Promise<DecisionsResponse> =>
    USE_MOCK ? Promise.resolve(mockDecisions()) : fetchApi(`/kpi/decisions?limit=${limit}`),

  /** Experimental: advisory text only; requires bot `ADVISORY_LLM_ENABLED=true` and canonical v3 for traceId. */
  decisionAdvisory: (traceId: string, compare = false): Promise<DecisionAdvisoryResponse> => {
    if (USE_MOCK) {
      return Promise.resolve({
        traceId,
        enabled: false,
        canonical: null,
        advisory: null,
        advisorySecondary: null,
        audits: [],
      });
    }
    const q = compare ? '?compare=true' : '';
    return fetchApi(`/kpi/decisions/${encodeURIComponent(traceId)}/advisory${q}`);
  },

  metrics: (): Promise<MetricsResponse> =>
    USE_MOCK ? Promise.resolve(mockMetrics()) : fetchApi('/kpi/metrics'),

  operatorSession: (): Promise<DashboardOperatorAuthState> =>
    USE_MOCK ? Promise.resolve(mockDashboardSession()) : fetchAuthApi('/session'),

  login: (input: DashboardLoginRequest): Promise<DashboardLoginResponse> =>
    USE_MOCK ? Promise.resolve(mockDashboardLogin(input)) : fetchAuthApi('/login', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  logout: (): Promise<DashboardLogoutResponse> =>
    USE_MOCK ? Promise.resolve(mockDashboardLogout()) : fetchAuthApi('/logout', { method: 'POST' }),

  controlStatus: (): Promise<ControlStatusResponse> =>
    USE_MOCK ? Promise.resolve(mockControlStatus()) : fetchProxyApi('/status'),

  restartAlerts: (): Promise<RestartAlertListResponse> =>
    USE_MOCK ? Promise.resolve(mockRestartAlerts()) : fetchProxyApi('/restart-alerts'),

  restartAlertDeliveries: (query: WorkerRestartDeliveryQuery = {}): Promise<WorkerRestartDeliveryJournalResponse> =>
    USE_MOCK
      ? Promise.resolve(mockRestartAlertDeliveries(query))
      : fetchProxyApi(`/restart-alert-deliveries${buildDeliveryQueryString(query)}`),

  restartAlertDeliverySummary: (query: WorkerRestartDeliveryQuery = {}): Promise<WorkerRestartDeliverySummaryResponse> =>
    USE_MOCK
      ? Promise.resolve(mockRestartAlertDeliverySummary(query))
      : fetchProxyApi(`/restart-alert-deliveries/summary${buildDeliveryQueryString(query)}`),

  restartAlertDeliveryTrends: (query: WorkerRestartDeliveryTrendQuery = {}): Promise<WorkerRestartDeliveryTrendResponse> =>
    USE_MOCK
      ? Promise.resolve(mockRestartAlertDeliveryTrends(query))
      : fetchProxyApi(`/restart-alert-deliveries/trends${buildDeliveryQueryString(query)}`),

  livePromotions: (targetMode: LivePromotionTargetMode = 'live_limited'): Promise<LivePromotionListResponse> =>
    USE_MOCK ? Promise.resolve(mockLivePromotions({ targetMode })) : fetchProxyApi(`/live-promotion${buildLivePromotionQueryString(targetMode)}`),

  requestLivePromotion: (input: LivePromotionRequestBody): Promise<{ success: true; request: LivePromotionRecord }> =>
    USE_MOCK ? Promise.resolve(mockRequestLivePromotion(input)) : fetchProxyApi('/live-promotion/request', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  approveLivePromotion: (id: string, input: LivePromotionDecisionBody = {}): Promise<{ success: true; request: LivePromotionRecord }> =>
    USE_MOCK ? Promise.resolve(mockApproveLivePromotion(id, input)) : fetchProxyApi(`/live-promotion/${id}/approve`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  denyLivePromotion: (id: string, input: LivePromotionDecisionBody = {}): Promise<{ success: true; request: LivePromotionRecord }> =>
    USE_MOCK ? Promise.resolve(mockDenyLivePromotion(id, input)) : fetchProxyApi(`/live-promotion/${id}/deny`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  applyLivePromotion: (id: string, input: LivePromotionDecisionBody = {}): Promise<{ success: true; request: LivePromotionRecord }> =>
    USE_MOCK ? Promise.resolve(mockApplyLivePromotion(id, input)) : fetchProxyApi(`/live-promotion/${id}/apply`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  rollbackLivePromotion: (id: string, input: LivePromotionDecisionBody = {}): Promise<{ success: true; request: LivePromotionRecord }> =>
    USE_MOCK ? Promise.resolve(mockRollbackLivePromotion(id, input)) : fetchProxyApi(`/live-promotion/${id}/rollback`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  emergencyStop: (): Promise<EmergencyStopResponse> =>
    fetchProxyApi('/emergency-stop', { method: 'POST' }),

  reset: (): Promise<ResetResponse> =>
    fetchProxyApi('/reset', { method: 'POST' }),

  acknowledgeRestartAlert: (id: string, input: RestartAlertActionRequest = {}): Promise<RestartAlertActionResponse> =>
    fetchProxyApi(`/restart-alerts/${id}/acknowledge`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  resolveRestartAlert: (id: string, input: RestartAlertActionRequest = {}): Promise<RestartAlertActionResponse> =>
    fetchProxyApi(`/restart-alerts/${id}/resolve`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  restartWorker: (input: RestartWorkerRequest = {}): Promise<RestartWorkerResponse> =>
    USE_MOCK
      ? Promise.resolve(mockRestartWorker(input))
      : fetchProxyApi('/restart-worker', {
          method: 'POST',
          headers: input.idempotencyKey ? { 'x-idempotency-key': input.idempotencyKey } : undefined,
          body: JSON.stringify({ reason: input.reason }),
        }),
};
