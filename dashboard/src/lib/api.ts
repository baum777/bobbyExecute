import type {
  HealthResponse,
  SummaryResponse,
  AdaptersResponse,
  DecisionsResponse,
  MetricsResponse,
  ControlStatusResponse,
  EmergencyStopResponse,
  RestartAlertActionRequest,
  RestartAlertActionResponse,
  RestartAlertListResponse,
  RestartWorkerRequest,
  RestartWorkerResponse,
  ResetResponse,
} from '../types/api';
import { API_BASE, USE_MOCK } from './constants';
import {
  mockHealth,
  mockSummary,
  mockAdapters,
  mockDecisions,
  mockMetrics,
  mockControlStatus,
  mockRestartAlerts,
  mockRestartWorker,
} from './mock-data';

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

async function fetchApi<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
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
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
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

export const api = {
  health: (): Promise<HealthResponse> =>
    USE_MOCK ? Promise.resolve(mockHealth()) : fetchApi('/health'),

  summary: (): Promise<SummaryResponse> =>
    USE_MOCK ? Promise.resolve(mockSummary()) : fetchApi('/kpi/summary'),

  adapters: (): Promise<AdaptersResponse> =>
    USE_MOCK ? Promise.resolve(mockAdapters()) : fetchApi('/kpi/adapters'),

  decisions: (limit = 50): Promise<DecisionsResponse> =>
    USE_MOCK ? Promise.resolve(mockDecisions()) : fetchApi(`/kpi/decisions?limit=${limit}`),

  metrics: (): Promise<MetricsResponse> =>
    USE_MOCK ? Promise.resolve(mockMetrics()) : fetchApi('/kpi/metrics'),

  controlStatus: (): Promise<ControlStatusResponse> =>
    USE_MOCK ? Promise.resolve(mockControlStatus()) : fetchProxyApi('/status'),

  restartAlerts: (): Promise<RestartAlertListResponse> =>
    USE_MOCK ? Promise.resolve(mockRestartAlerts()) : fetchProxyApi('/restart-alerts'),

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
