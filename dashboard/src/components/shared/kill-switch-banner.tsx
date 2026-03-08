'use client';

import { ShieldAlert } from 'lucide-react';

export function KillSwitchBanner() {
  return (
    <div className="flex items-center gap-2 rounded-md border border-accent-danger/50 bg-accent-danger/10 px-3 py-1.5 animate-pulse-glow">
      <ShieldAlert className="h-4 w-4 text-accent-danger" />
      <span className="text-xs font-semibold text-accent-danger uppercase tracking-wider">
        Kill Switch Active
      </span>
    </div>
  );
}
