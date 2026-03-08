import { cn } from '@/lib/utils';
import { forwardRef } from 'react';

type Variant = 'default' | 'success' | 'warning' | 'danger' | 'info';

const variantClasses: Record<Variant, string> = {
  default: 'bg-bg-surface-hover text-text-secondary border-border-default',
  success: 'bg-accent-success/10 text-accent-success border-accent-success/30',
  warning: 'bg-accent-warning/10 text-accent-warning border-accent-warning/30',
  danger: 'bg-accent-danger/10 text-accent-danger border-accent-danger/30',
  info: 'bg-accent-cyan/10 text-accent-cyan border-accent-cyan/30',
};

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: Variant;
}

export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant = 'default', ...props }, ref) => (
    <span
      ref={ref}
      className={cn(
        'inline-flex items-center rounded-sm border px-2 py-0.5 text-xs font-medium',
        variantClasses[variant],
        className
      )}
      {...props}
    />
  )
);
Badge.displayName = 'Badge';
