'use client';

import type { AdapterStatus, HealthStatus, DecisionAction } from '@/types/api';
import { Badge } from '@/components/ui/badge';
import { ADAPTER_STATUS_CONFIG, DECISION_ACTION_CONFIG, HEALTH_STATUS_CONFIG } from '@/lib/constants';

export function AdapterStatusBadge({ status }: { status: AdapterStatus }) {
  const config = ADAPTER_STATUS_CONFIG[status];
  const variant = status === 'healthy' ? 'success' : status === 'degraded' ? 'warning' : 'danger';
  return <Badge variant={variant}>{config.label}</Badge>;
}

export function HealthStatusBadge({ status }: { status: HealthStatus }) {
  const config = HEALTH_STATUS_CONFIG[status];
  const variant = status === 'OK' ? 'success' : status === 'DEGRADED' ? 'warning' : 'danger';
  return <Badge variant={variant}>{config.label}</Badge>;
}

export function DecisionActionBadge({ action }: { action: DecisionAction }) {
  const config = DECISION_ACTION_CONFIG[action];
  const variant = action === 'allow' ? 'success' : action === 'block' ? 'danger' : 'warning';
  return <Badge variant={variant}>{config.label}</Badge>;
}
