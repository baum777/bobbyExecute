import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export function LoadingCard({ className }: { className?: string }) {
  return (
    <Card className={cn('animate-pulse', className)}>
      <div className="space-y-3">
        <div className="h-3 w-24 rounded bg-border-default/40" />
        <div className="h-8 w-16 rounded bg-border-default/30" />
        <div className="h-3 w-32 rounded bg-border-default/20" />
      </div>
    </Card>
  );
}

export function LoadingRow() {
  return (
    <div className="flex animate-pulse items-center gap-4 border-b border-border-subtle py-3">
      <div className="h-4 w-24 rounded bg-border-default/30" />
      <div className="h-4 w-16 rounded bg-border-default/20" />
      <div className="h-4 w-12 rounded bg-border-default/20" />
      <div className="h-4 w-20 rounded bg-border-default/20" />
    </div>
  );
}
