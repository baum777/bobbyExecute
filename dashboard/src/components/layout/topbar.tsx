'use client';

import { useHealth } from '@/hooks/use-health';
import { useSummary } from '@/hooks/use-summary';
import { useTheme } from '@/providers/theme-provider';
import { KillSwitchBanner } from '@/components/shared/kill-switch-banner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Activity, Sun, Monitor, RefreshCw } from 'lucide-react';
import { formatUptime, relativeTime } from '@/lib/utils';
import { HEALTH_STATUS_CONFIG, BOT_STATUS_CONFIG, USE_MOCK } from '@/lib/constants';

export function Topbar() {
  const { data: health, isLoading: hLoading, dataUpdatedAt } = useHealth();
  const { data: summary } = useSummary();
  const { theme, toggleTheme } = useTheme();

  const stale = dataUpdatedAt ? Date.now() - dataUpdatedAt > 30000 : false;

  return (
    <header className="sticky top-0 z-50 border-b border-border-default bg-bg-surface/95 backdrop-blur-sm">
      <div className="flex h-14 items-center justify-between px-4 lg:px-6 gap-4">
        <div className="flex items-center gap-3 shrink-0">
          <h1 className="text-base font-bold tracking-tight text-text-primary">
            BobbyExecution
          </h1>
          <Badge variant={USE_MOCK ? 'warning' : 'info'}>
            {USE_MOCK ? 'STUB' : 'LIVE'}
          </Badge>
        </div>

        <div className="hidden md:flex items-center gap-3 flex-1 justify-center">
          {health?.killSwitch?.halted && <KillSwitchBanner />}
        </div>

        <div className="flex items-center gap-3 shrink-0">
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

      {health?.killSwitch?.halted && (
        <div className="flex md:hidden items-center justify-center py-1.5 border-t border-accent-danger/30 bg-accent-danger/5">
          <KillSwitchBanner />
        </div>
      )}
    </header>
  );
}
