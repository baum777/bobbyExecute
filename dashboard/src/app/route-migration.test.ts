import { beforeEach, describe, expect, it, vi } from 'vitest';

const redirect = vi.fn((target: string) => {
  throw new Error(`redirect:${target}`);
});

vi.mock('next/navigation', () => ({
  redirect,
}));

async function expectRedirect(modulePath: string, expectedTarget: string): Promise<void> {
  const mod = await import(modulePath);
  expect(() => mod.default()).toThrow(`redirect:${expectedTarget}`);
  expect(redirect).toHaveBeenCalledWith(expectedTarget);
}

describe('dashboard route migration', () => {
  beforeEach(() => {
    redirect.mockClear();
    vi.resetModules();
  });

  it('redirects the root route to /overview', async () => {
    await expectRedirect('./page', '/control');
  });

  it('redirects legacy adapters to /advanced', async () => {
    await expectRedirect('./adapters/page', '/advanced');
  });

  it('redirects legacy decisions to /journal', async () => {
    await expectRedirect('./decisions/page', '/journal');
  });
});
