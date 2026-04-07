import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  usePathname: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  usePathname: mocks.usePathname,
}));

import { Navigation } from './navigation';

describe('Navigation', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('keeps five primary routes available while routing advanced through overflow on mobile', () => {
    mocks.usePathname.mockReturnValue('/overview');

    const html = renderToStaticMarkup(
      <Navigation tabletNavOpen={true} onTabletNavOpenChange={vi.fn()} />
    );

    expect(html).toContain('Primary navigation');
    expect(html).toContain('Tablet dashboard navigation');
    expect(html).toContain('Mobile primary navigation');
    expect(html).toContain('Overflow');
    expect(html).toContain('Overview');
    expect(html).toContain('Control');
    expect(html).toContain('Journal');
    expect(html).toContain('Recovery');
    expect(html).toContain('Advanced');
    expect(html).toContain('md:hidden');
    expect(html).toContain('lg:flex');
    expect(html).toContain('aria-label="Open advanced navigation"');
  });
});
