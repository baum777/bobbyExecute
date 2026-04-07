'use client';

import { Badge } from '@/components/ui/badge';

interface OperatorStatusStripProps {
  releaseGateAllowed?: boolean;
  killSwitchHalted?: boolean;
  blockedCount?: number;
  restartRequired?: boolean;
}

function StatusCell({
  label,
  value,
  detail,
  variant,
}: {
  label: string;
  value: string;
  detail?: string;
  variant: 'success' | 'warning' | 'danger' | 'info' | 'default';
}) {
  return (
    <div className="rounded-md border border-border-subtle bg-bg-surface-hover/35 px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] uppercase tracking-wide text-text-muted">{label}</span>
        <Badge variant={variant}>{value}</Badge>
      </div>
      {detail && <p className="mt-1 text-xs text-text-secondary">{detail}</p>}
    </div>
  );
}

export function OperatorStatusStrip({
  releaseGateAllowed,
  killSwitchHalted,
  blockedCount = 0,
  restartRequired,
}: OperatorStatusStripProps) {
  return (
    <div
      aria-label="Operator status strip"
      className="grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-4"
    >
      <StatusCell
        label="release_gate"
        value={releaseGateAllowed === undefined ? '—' : releaseGateAllowed ? 'allowed' : 'blocked'}
        detail={
          releaseGateAllowed === undefined
            ? 'Waiting for gate state'
            : releaseGateAllowed
              ? 'Release gate open'
              : `${blockedCount} blocked reason(s)`
        }
        variant={releaseGateAllowed === undefined ? 'default' : releaseGateAllowed ? 'success' : 'danger'}
      />
      <StatusCell
        label="kill_switch"
        value={killSwitchHalted === undefined ? '—' : killSwitchHalted ? 'halted' : 'active'}
        detail={
          killSwitchHalted === undefined
            ? 'Waiting for safety state'
            : killSwitchHalted
              ? 'Emergency halt active'
              : 'Safety control open'
        }
        variant={killSwitchHalted === undefined ? 'default' : killSwitchHalted ? 'danger' : 'success'}
      />
      <StatusCell
        label="blocked"
        value={blockedCount > 0 ? String(blockedCount) : '0'}
        detail={blockedCount > 0 ? 'Blocked reasons visible' : 'No blocked reasons recorded'}
        variant={blockedCount > 0 ? 'warning' : 'success'}
      />
      <StatusCell
        label="restart_required"
        value={restartRequired === undefined ? '—' : restartRequired ? 'yes' : 'no'}
        detail={
          restartRequired === undefined
            ? 'Waiting for restart state'
            : restartRequired
              ? 'After restart controls remain visible'
              : 'No restart required'
        }
        variant={restartRequired === undefined ? 'default' : restartRequired ? 'warning' : 'success'}
      />
    </div>
  );
}
