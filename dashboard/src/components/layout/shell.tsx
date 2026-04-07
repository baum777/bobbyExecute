'use client';

import { useState } from 'react';
import { Topbar } from './topbar';
import { Navigation } from './navigation';

export function Shell({ children }: { children: React.ReactNode }) {
  const [tabletNavOpen, setTabletNavOpen] = useState(false);

  return (
    <div className="min-h-screen flex flex-col bg-bg-primary text-text-primary retro-scanlines">
      <Topbar onOpenNavigation={() => setTabletNavOpen(true)} />
      <div className="flex flex-1 min-h-0">
        <Navigation tabletNavOpen={tabletNavOpen} onTabletNavOpenChange={setTabletNavOpen} />
        <main className="flex-1 min-h-0 overflow-x-hidden p-4 pb-[calc(6rem+env(safe-area-inset-bottom))] md:pb-8 lg:pb-6 lg:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
