import type {
  HealthResponse,
  SummaryResponse,
  AdaptersResponse,
  DecisionsResponse,
  MetricsResponse,
  EmergencyStopResponse,
  ResetResponse,
} from '@/types/api';
import { API_BASE, USE_MOCK } from './constants';
import { mockHealth, mockSummary, mockAdapters, mockDecisions, mockMetrics } from './mock-data';

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
    throw new ApiError(response.status, `${response.status} ${response.statusText}`);
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

  emergencyStop: (): Promise<EmergencyStopResponse> =>
    fetchApi('/emergency-stop', { method: 'POST' }),

  reset: (): Promise<ResetResponse> =>
    fetchApi('/control/reset', { method: 'POST' }),
};
