import { describe, expect, it } from 'vitest';
import { DASHBOARD_LEGACY_REDIRECTS, DASHBOARD_PRIMARY_ROUTES } from './dashboard-route-map';
import { NAV_ITEMS } from './constants';

describe('dashboard route map', () => {
  it('exposes the V1 primary route set', () => {
    expect(DASHBOARD_PRIMARY_ROUTES.map((route) => route.href)).toEqual([
      '/overview',
      '/control',
      '/journal',
      '/recovery',
      '/advanced',
    ]);
    expect(NAV_ITEMS.map((route) => route.href)).toEqual([
      '/overview',
      '/control',
      '/journal',
      '/recovery',
      '/advanced',
    ]);
    expect(NAV_ITEMS.some((route) => route.href === '/' || route.href === '/adapters' || route.href === '/decisions')).toBe(false);
  });

  it('keeps legacy routes on explicit migration targets', () => {
    expect(DASHBOARD_LEGACY_REDIRECTS).toEqual({
      '/': '/overview',
      '/adapters': '/advanced',
      '/decisions': '/journal',
    });
  });
});
