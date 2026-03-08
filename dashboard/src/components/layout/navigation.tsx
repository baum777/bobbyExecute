'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Plug, ScrollText, ShieldAlert } from 'lucide-react';
import { cn } from '@/lib/utils';

const items = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/adapters', label: 'Adapters', icon: Plug },
  { href: '/decisions', label: 'Decisions', icon: ScrollText },
  { href: '/control', label: 'Control', icon: ShieldAlert },
];

export function Navigation() {
  const pathname = usePathname();

  return (
    <>
      <nav className="hidden lg:flex flex-col w-52 border-r border-border-default bg-bg-surface/50 min-h-[calc(100vh-3.5rem)] p-3 gap-1">
        {items.map(({ href, label, icon: Icon }) => {
          const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors',
                active
                  ? 'bg-accent-cyan/10 text-accent-cyan border border-accent-cyan/20'
                  : 'text-text-secondary hover:text-text-primary hover:bg-bg-surface-hover border border-transparent'
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {label}
            </Link>
          );
        })}
      </nav>

      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 flex items-center justify-around border-t border-border-default bg-bg-surface/95 backdrop-blur-sm px-2 py-2">
        {items.map(({ href, label, icon: Icon }) => {
          const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex flex-col items-center gap-0.5 px-3 py-1 rounded-md text-xs transition-colors',
                active ? 'text-accent-cyan' : 'text-text-muted hover:text-text-secondary'
              )}
            >
              <Icon className="h-5 w-5" />
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
