import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

describe('control client request building', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } }))
    );
    process.env.CONTROL_SERVICE_URL = 'http://127.0.0.1:3334';
    process.env.CONTROL_TOKEN = 'control-token';
    process.env.OPERATOR_READ_TOKEN = 'read-token';
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.CONTROL_SERVICE_URL;
    delete process.env.CONTROL_TOKEN;
    delete process.env.OPERATOR_READ_TOKEN;
  });

  it('omits JSON headers and the body for empty control posts', async () => {
    const { forwardControlRequest } = await import('./control-client');

    await forwardControlRequest('/emergency-stop', { method: 'POST', body: '' }, process.env);

    const fetchMock = vi.mocked(fetch);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0] as [RequestInfo | URL, RequestInit];
    expect(String(url)).toBe('http://127.0.0.1:3334/emergency-stop');
    expect(init.body).toBeUndefined();
    expect(new Headers(init.headers).get('content-type')).toBeNull();
    expect(new Headers(init.headers).get('authorization')).toBe('Bearer control-token');
  });

  it('keeps JSON headers and payloads for real JSON control posts', async () => {
    const { forwardControlRequest } = await import('./control-client');
    const payload = JSON.stringify({ reason: 'operator request' });

    await forwardControlRequest('/control/runtime-config', { method: 'POST', body: payload }, process.env);

    const fetchMock = vi.mocked(fetch);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0] as [RequestInfo | URL, RequestInit];
    expect(String(url)).toBe('http://127.0.0.1:3334/control/runtime-config');
    expect(init.body).toBe(payload);
    expect(new Headers(init.headers).get('content-type')).toBe('application/json');
  });
});
