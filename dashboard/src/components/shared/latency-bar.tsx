'use client';

import { cn } from '@/lib/utils';

interface LatencyBarProps {
  label: string;
  value: number;
  maxValue?: number;
}

export function LatencyBar({ label, value, maxValue = 300 }: LatencyBarProps) {
  const pct = Math.min((value / maxValue) * 100, 100);
  const color =
    value < 100
      ? 'bg-accent-success'
      : value < 200
        ? 'bg-accent-warning'
        : 'bg-accent-danger';

  return (
    <div className="flex items-center gap-3">
      <span className="w-16 text-xs text-text-muted shrink-0">{label}</span>
      <div className="flex-1 h-2 rounded-full bg-border-subtle overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all duration-500', color)}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-14 text-right text-xs text-text-secondary tabular-nums">{value}ms</span>
    </div>
  );
}
