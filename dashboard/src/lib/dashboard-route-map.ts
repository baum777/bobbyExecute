export const DASHBOARD_PRIMARY_ROUTES = [
  { href: '/overview', label: 'Overview', icon: 'LayoutDashboard' },
  { href: '/control', label: 'Control', icon: 'ShieldAlert' },
  { href: '/journal', label: 'Journal', icon: 'ScrollText' },
  { href: '/recovery', label: 'Recovery', icon: 'ShieldCheck' },
  { href: '/advanced', label: 'Advanced', icon: 'SlidersHorizontal' },
] as const;

export const DASHBOARD_LEGACY_REDIRECTS = {
  '/': '/overview',
  '/adapters': '/advanced',
  '/decisions': '/journal',
} as const;
