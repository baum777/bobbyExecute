import { cn } from '@/lib/utils';
import { forwardRef } from 'react';

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        'flex h-10 w-full rounded-md border border-border-default bg-bg-surface px-3 py-2 text-sm text-text-primary',
        'placeholder:text-text-muted',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-cyan/50 focus-visible:border-accent-cyan/50',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
      {...props}
    />
  )
);
Input.displayName = 'Input';
