'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, ShieldAlert, ScrollText, ShieldCheck, SlidersHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';
import { NAV_ITEMS } from '@/lib/constants';

const ICONS = {
  LayoutDashboard,
  ShieldAlert,
  ScrollText,
  ShieldCheck,
  SlidersHorizontal,
} as const;

interface NavigationProps {
  tabletNavOpen: boolean;
  onTabletNavOpenChange: (open: boolean) => void;
}

function NavLink({
  href,
  label,
  icon,
  active,
  onClick,
  className,
}: {
  href: string;
  label: string;
  icon: keyof typeof ICONS;
  active: boolean;
  onClick?: () => void;
  className: string;
}) {
  const Icon = ICONS[icon];

  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      onClick={onClick}
      className={className}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span>{label}</span>
    </Link>
  );
}

export function Navigation({ tabletNavOpen, onTabletNavOpenChange }: NavigationProps) {
  const pathname = usePathname();
  const [mobileOverflowOpen, setMobileOverflowOpen] = useState(false);
  const primaryMobileItems = NAV_ITEMS.slice(0, 4);
  const overflowMobileItem = NAV_ITEMS[4];

  const desktopLinkClass = (active: boolean) =>
    cn(
      'flex min-h-11 items-center gap-3 rounded-md border px-3 py-2.5 text-sm font-medium transition-colors',
      active
        ? 'border-accent-cyan/20 bg-accent-cyan/10 text-accent-cyan'
        : 'border-transparent text-text-secondary hover:bg-bg-surface-hover hover:text-text-primary'
    );

  const mobileTabClass = (active: boolean) =>
    cn(
      'flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-md px-2 py-1 text-[11px] font-medium transition-colors',
      active ? 'text-accent-cyan' : 'text-text-muted hover:text-text-secondary'
    );

  const overflowActive = pathname === overflowMobileItem.href || pathname.startsWith(`${overflowMobileItem.href}/`);

  return (
    <>
      <nav
        aria-label="Primary navigation"
        className="sticky top-[7.5rem] hidden max-h-[calc(100vh-7.5rem)] flex-col gap-1 self-start overflow-y-auto border-r border-border-default bg-bg-surface/50 p-3 lg:flex lg:w-44 xl:w-52"
      >
        {NAV_ITEMS.map(({ href, label, icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <NavLink
              key={href}
              href={href}
              label={label}
              icon={icon}
              active={active}
              className={desktopLinkClass(active)}
            />
          );
        })}
      </nav>

      <div
        className={cn(
          'fixed inset-0 z-40 hidden md:flex lg:hidden',
          tabletNavOpen ? 'pointer-events-auto' : 'pointer-events-none'
        )}
        aria-hidden={!tabletNavOpen}
      >
        <button
          type="button"
          aria-label="Close dashboard navigation"
          className={cn(
            'absolute inset-0 bg-black/55 backdrop-blur-sm transition-opacity duration-200',
            tabletNavOpen ? 'opacity-100' : 'opacity-0'
          )}
          onClick={() => onTabletNavOpenChange(false)}
        />
        <aside
          role="dialog"
          aria-label="Tablet dashboard navigation"
          className={cn(
            'relative z-10 mt-[7.5rem] h-[calc(100vh-7.5rem)] w-[min(18rem,85vw)] border-r border-border-default bg-bg-surface p-4 shadow-2xl transition-transform duration-200',
            tabletNavOpen ? 'translate-x-0' : '-translate-x-full'
          )}
        >
          <div className="mb-4">
            <p className="text-xs uppercase tracking-wide text-text-muted">Dashboard navigation</p>
            <p className="text-sm text-text-secondary">Five-screen V1 model, no legacy primary routes.</p>
          </div>
          <nav aria-label="Tablet primary navigation" className="space-y-1">
            {NAV_ITEMS.map(({ href, label, icon }) => {
              const active = pathname === href || pathname.startsWith(`${href}/`);
              return (
                <NavLink
                  key={href}
                  href={href}
                  label={label}
                  icon={icon}
                  active={active}
                  onClick={() => onTabletNavOpenChange(false)}
                  className={desktopLinkClass(active)}
                />
              );
            })}
          </nav>
        </aside>
      </div>

      <nav
        aria-label="Mobile primary navigation"
        className="fixed bottom-0 left-0 right-0 z-50 border-t border-border-default bg-bg-surface/95 px-2 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] backdrop-blur-sm md:hidden"
      >
        <div className="grid grid-cols-5 gap-1">
          {primaryMobileItems.map(({ href, label, icon }) => {
            const active = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <NavLink
                key={href}
                href={href}
                label={label}
                icon={icon}
                active={active}
                className={mobileTabClass(active)}
              />
            );
          })}

          <button
            type="button"
            aria-haspopup="dialog"
            aria-expanded={mobileOverflowOpen}
            aria-label="Open advanced navigation"
            onClick={() => setMobileOverflowOpen((open) => !open)}
            className={mobileTabClass(overflowActive)}
          >
            <SlidersHorizontal className="h-5 w-5" />
            <span>{overflowMobileItem.label}</span>
          </button>
        </div>

        <div
          className={cn(
            'fixed inset-0 z-40 transition-opacity duration-200',
            mobileOverflowOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
          )}
          aria-hidden={!mobileOverflowOpen}
        >
          <button
            type="button"
            aria-label="Close advanced navigation"
            className="absolute inset-0 bg-black/55 backdrop-blur-sm"
            onClick={() => setMobileOverflowOpen(false)}
          />
          <div
            role="dialog"
            aria-label="Advanced navigation"
            className={cn(
              'absolute left-2 right-2 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] rounded-lg border border-border-default bg-bg-surface p-3 shadow-2xl transition-transform duration-200',
              mobileOverflowOpen ? 'translate-y-0' : 'translate-y-4'
            )}
          >
            <p className="text-xs uppercase tracking-wide text-text-muted">Overflow</p>
            <p className="mb-3 text-sm text-text-secondary">Advanced remains secondary and outside the primary tab bar.</p>
            <NavLink
              href={overflowMobileItem.href}
              label={overflowMobileItem.label}
              icon={overflowMobileItem.icon}
              active={overflowActive}
              onClick={() => setMobileOverflowOpen(false)}
              className={desktopLinkClass(overflowActive)}
            />
          </div>
        </div>
      </nav>
    </>
  );
}
