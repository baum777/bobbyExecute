import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';

interface ErrorCardProps {
  message?: string;
  onRetry?: () => void;
}

export function ErrorCard({ message = 'Failed to load data', onRetry }: ErrorCardProps) {
  return (
    <Card className="border-accent-danger/30">
      <div className="flex flex-col items-center gap-3 py-4 text-center">
        <AlertTriangle className="h-8 w-8 text-accent-danger" />
        <p className="text-sm text-accent-danger">{message}</p>
        {onRetry && (
          <Button variant="outline" size="sm" onClick={onRetry}>
            Retry
          </Button>
        )}
      </div>
    </Card>
  );
}
