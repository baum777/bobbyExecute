import { cn } from '@/lib/utils';
import { forwardRef } from 'react';

type Variant = 'default' | 'danger' | 'ghost' | 'outline';

const variantClasses: Record<Variant, string> = {
  default:
    'bg-accent-cyan/15 text-accent-cyan border-accent-cyan/30 hover:bg-accent-cyan/25',
  danger:
    'bg-accent-danger/15 text-accent-danger border-accent-danger/30 hover:bg-accent-danger/25',
  ghost:
    'bg-transparent text-text-secondary hover:bg-bg-surface-hover hover:text-text-primary border-transparent',
  outline:
    'bg-transparent text-text-primary border-border-default hover:bg-bg-surface-hover',
};

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: 'sm' | 'md' | 'lg';
}

const sizeClasses = {
  sm: 'h-8 px-3 text-xs',
  md: 'h-10 px-4 text-sm',
  lg: 'h-12 px-6 text-base',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'md', disabled, ...props }, ref) => (
    <button
      ref={ref}
      disabled={disabled}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-md border font-medium transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-cyan/50',
        'disabled:pointer-events-none disabled:opacity-40',
        variantClasses[variant],
        sizeClasses[size],
        className
      )}
      {...props}
    />
  )
);
Button.displayName = 'Button';
