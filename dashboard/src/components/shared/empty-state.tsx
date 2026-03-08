import { Inbox } from 'lucide-react';
import { cn } from '@/lib/utils';

interface EmptyStateProps {
  message?: string;
  className?: string;
}

export function EmptyState({ message = 'No data available', className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center gap-3 py-8 text-center', className)}>
      <Inbox className="h-10 w-10 text-text-muted" />
      <p className="text-sm text-text-muted">{message}</p>
    </div>
  );
}
