import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

describe('dashboard api request building', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } }))
    );
    process.env.NEXT_PUBLIC_USE_MOCK = 'false';
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.NEXT_PUBLIC_USE_MOCK;
  });

  it('does not add JSON headers or a body for bodyless control posts', async () => {
    const { api } = await import('./api');

    await api.emergencyStop();

    const fetchMock = vi.mocked(fetch);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/control/emergency-stop');
    expect(init.method).toBe('POST');
    expect(init.body).toBeUndefined();
    expect(new Headers(init.headers).get('content-type')).toBeNull();
  });

  it('still sends JSON headers and body for JSON requests', async () => {
    const { api } = await import('./api');

    await api.login({ username: 'alice', password: 'secret' });

    const fetchMock = vi.mocked(fetch);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/auth/login');
    expect(init.method).toBe('POST');
    expect(init.body).toBe(JSON.stringify({ username: 'alice', password: 'secret' }));
    expect(new Headers(init.headers).get('content-type')).toBe('application/json');
  });
});
