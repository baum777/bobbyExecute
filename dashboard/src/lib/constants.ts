import { DASHBOARD_PRIMARY_ROUTES } from './dashboard-route-map';

export const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3333';
export const USE_MOCK = process.env.NEXT_PUBLIC_USE_MOCK === 'true';

export const POLLING = {
  HEALTH: 2000,
  CONTROL_STATUS: 5000,
  SUMMARY: 10000,
  ADAPTERS: 10000,
  DECISIONS: 10000,
  METRICS: 10000,
} as const;

export const NAV_ITEMS = DASHBOARD_PRIMARY_ROUTES;

export const ADAPTER_STATUS_CONFIG = {
  healthy: { label: 'Healthy', color: 'bg-accent-success', textColor: 'text-accent-success' },
  degraded: { label: 'Degraded', color: 'bg-accent-warning', textColor: 'text-accent-warning' },
  down: { label: 'Down', color: 'bg-accent-danger', textColor: 'text-accent-danger' },
} as const;

export const DECISION_ACTION_CONFIG = {
  allow: { label: 'Allow', color: 'bg-accent-success/15 text-accent-success border-accent-success/30' },
  block: { label: 'Block', color: 'bg-accent-danger/15 text-accent-danger border-accent-danger/30' },
  abort: { label: 'Abort', color: 'bg-accent-warning/15 text-accent-warning border-accent-warning/30' },
} as const;

export const HEALTH_STATUS_CONFIG = {
  OK: { label: 'Healthy', color: 'text-accent-success', bg: 'bg-accent-success/10' },
  DEGRADED: { label: 'Degraded', color: 'text-accent-warning', bg: 'bg-accent-warning/10' },
  FAIL: { label: 'Failed', color: 'text-accent-danger', bg: 'bg-accent-danger/10' },
} as const;

export const BOT_STATUS_CONFIG = {
  running: { label: 'Running', color: 'text-accent-success' },
  paused: { label: 'Paused', color: 'text-accent-warning' },
  stopped: { label: 'Stopped', color: 'text-accent-danger' },
} as const;
