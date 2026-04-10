import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildDashboardSessionCookie, hashDashboardOperatorPassword } from '@/lib/operator-auth';
import { DASHBOARD_SESSION_COOKIE } from '@/lib/operator-policy';

let sessionCookieValue: string | undefined;

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({
    get: (name: string) => (name === DASHBOARD_SESSION_COOKIE && sessionCookieValue ? { value: sessionCookieValue } : undefined),
  })),
}));

function setOperatorDirectory(): void {
  const password = 'correct horse battery staple';
  const salt = 'dashboard-test-salt';
  const iterations = 1_000;
  process.env.DASHBOARD_SESSION_SECRET = 'dashboard-session-secret';
  process.env.DASHBOARD_OPERATOR_DIRECTORY_JSON = JSON.stringify([
    {
      username: 'alice',
      displayName: 'Alice Example',
      role: 'admin',
      passwordSalt: salt,
      passwordHash: hashDashboardOperatorPassword(password, salt, iterations),
      passwordIterations: iterations,
    },
  ]);
}

describe('dashboard auth routes', () => {
  beforeEach(() => {
    sessionCookieValue = undefined;
    delete process.env.DASHBOARD_SESSION_SECRET;
    delete process.env.DASHBOARD_OPERATOR_DIRECTORY_JSON;
    delete process.env.DASHBOARD_OPERATOR_REGISTRY_JSON;
    delete process.env.DASHBOARD_OPERATORS_JSON;
    setOperatorDirectory();
    vi.resetModules();
  });

  it('logs in, stores a signed cookie, and returns the session state', async () => {
    const { POST: login } = await import('./login/route');
    const loginResponse = await login(
      new Request('http://localhost/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username: 'alice', password: 'correct horse battery staple' }),
        headers: { 'content-type': 'application/json' },
      }) as unknown as import('next/server').NextRequest
    );

    expect(loginResponse.status).toBe(200);
    await expect(loginResponse.json()).resolves.toMatchObject({
      authenticated: true,
      configured: true,
      session: {
        actorId: 'alice',
        displayName: 'Alice Example',
        role: 'admin',
      },
    });

    const setCookie = loginResponse.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain(DASHBOARD_SESSION_COOKIE);
    expect(setCookie).toContain('HttpOnly');

    sessionCookieValue = buildDashboardSessionCookie(
      {
        sessionId: 'session-123',
        actorId: 'alice',
        displayName: 'Alice Example',
        role: 'admin',
        issuedAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      },
      process.env
    ).value;

    const { GET: session } = await import('./session/route');
    const sessionResponse = await session();
    expect(sessionResponse.status).toBe(200);
    await expect(sessionResponse.json()).resolves.toMatchObject({
      configured: true,
      authenticated: true,
      identityLabel: 'Alice Example (admin)',
      session: {
        actorId: 'alice',
        role: 'admin',
      },
    });
  });

  it('rejects invalid credentials and clears the session on logout', async () => {
    const { POST: login } = await import('./login/route');
    const loginResponse = await login(
      new Request('http://localhost/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username: 'alice', password: 'wrong' }),
        headers: { 'content-type': 'application/json' },
      }) as unknown as import('next/server').NextRequest
    );
    expect(loginResponse.status).toBe(401);
    await expect(loginResponse.json()).resolves.toMatchObject({
      authenticated: false,
      configured: true,
    });

    const { POST: logout } = await import('./logout/route');
    const logoutResponse = await logout();
    expect(logoutResponse.status).toBe(200);
    const setCookie = logoutResponse.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain(DASHBOARD_SESSION_COOKIE);
    expect(setCookie).toContain('Max-Age=0');
  });
});
