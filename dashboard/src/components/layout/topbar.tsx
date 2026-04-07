'use client';

import { useHealth } from '@/hooks/use-health';
import { useSummary } from '@/hooks/use-summary';
import { useControlStatus, useLivePromotions } from '@/hooks/use-control';
import { useTheme } from '@/providers/theme-provider';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Menu, Sun, Monitor, RefreshCw } from 'lucide-react';
import { formatUptime, relativeTime } from '@/lib/utils';
import { HEALTH_STATUS_CONFIG, BOT_STATUS_CONFIG, USE_MOCK } from '@/lib/constants';
import { OperatorStatusStrip } from './operator-status-strip';

interface TopbarProps {
  onOpenNavigation?: () => void;
}

export function Topbar({ onOpenNavigation }: TopbarProps) {
  const { data: health, isLoading: hLoading, isStale } = useHealth();
  const { data: summary } = useSummary();
  const { data: controlStatus } = useControlStatus();
  const { data: livePromotions } = useLivePromotions('live_limited');
  const { theme, toggleTheme } = useTheme();

  const stale = Boolean(health && isStale);
  const blockedReasons = livePromotions?.gate.reasons.filter((reason) => reason.severity === 'blocked') ?? [];

  return (
    <header className="sticky top-0 z-50 border-b border-border-default bg-bg-surface/95 backdrop-blur-sm">
      <div className="flex h-14 items-center justify-between gap-3 px-4 lg:px-6">
        <div className="flex min-w-0 items-center gap-3 shrink-0">
          {onOpenNavigation && (
            <Button
              type="button"
              variant="ghost"
              size="md"
              className="md:inline-flex lg:hidden"
              onClick={onOpenNavigation}
              aria-label="Open dashboard navigation"
            >
              <Menu className="h-4 w-4" />
            </Button>
          )}
          <h1 className="text-base font-bold tracking-tight text-text-primary">BobbyExecution</h1>
          <Badge variant={USE_MOCK ? 'warning' : 'info'}>{USE_MOCK ? 'STUB' : 'LIVE'}</Badge>
        </div>

        <div className="hidden sm:flex items-center gap-2">
          {!hLoading && health && (
            <>
              <div className="hidden sm:flex items-center gap-2">
                <div
                  className={`h-2 w-2 rounded-full ${
                    health.status === 'OK'
                      ? 'bg-accent-success animate-pulse-glow'
                      : health.status === 'DEGRADED'
                        ? 'bg-accent-warning'
                        : 'bg-accent-danger'
                  }`}
                />
                <span className={`text-xs font-medium ${HEALTH_STATUS_CONFIG[health.status].color}`}>
                  {health.status}
                </span>
              </div>

              {summary && (
                <span className={`hidden lg:inline text-xs ${BOT_STATUS_CONFIG[summary.botStatus].color}`}>
                  {summary.botStatus.toUpperCase()}
                </span>
              )}

              <span className="hidden lg:inline text-xs text-text-muted">
                {formatUptime(health.uptimeMs)}
              </span>
            </>
          )}

          {stale && (
            <Badge variant="warning">
              <RefreshCw className="h-3 w-3 mr-1" />
              Stale
            </Badge>
          )}

          {summary?.lastDecisionAt && (
            <span className="hidden xl:inline text-xs text-text-muted">
              Last: {relativeTime(summary.lastDecisionAt)}
            </span>
          )}

          <Button variant="ghost" size="sm" onClick={toggleTheme} aria-label="Toggle theme">
            {theme === 'clean' ? <Sun className="h-4 w-4" /> : <Monitor className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      <div className="border-t border-border-subtle bg-bg-surface/90 px-4 py-2 lg:px-6">
        <OperatorStatusStrip
          releaseGateAllowed={livePromotions?.gate.allowed}
          killSwitchHalted={controlStatus?.killSwitch?.halted}
          blockedCount={blockedReasons.length}
          restartRequired={Boolean(controlStatus?.restart?.required || livePromotions?.gate.restartRequired)}
        />
      </div>
    </header>
  );
}
