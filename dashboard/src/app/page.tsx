'use client';

import { HeroCards } from '@/components/dashboard/hero-cards';
import { ActivitySection } from '@/components/dashboard/activity-section';
import { AdapterHealthTable } from '@/components/dashboard/adapter-health-table';
import { DecisionTimeline } from '@/components/dashboard/decision-timeline';

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-text-primary">Dashboard</h2>
        <p className="text-sm text-text-muted">System overview and operational status</p>
      </div>
      <HeroCards />
      <ActivitySection />
      <div className="grid gap-4 grid-cols-1 xl:grid-cols-2">
        <AdapterHealthTable />
        <DecisionTimeline />
      </div>
    </div>
  );
}
