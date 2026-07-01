import { Controller, createApp, Get, http, Post, response, UseMiddleware } from '@zeltjs/core';
import { describe, expect, it } from 'vitest';
import { SessionConfig } from './session.config';
import { destroySession, getSession, isNewSession, setSession } from './session.functions.lib';
import { SessionMiddleware } from './session.middleware';
import type { SessionSchema } from './session.types';

declare module '@zeltjs/auth-session' {
  interface SessionSchema {
    userId?: string;
    count?: number;
  }
}

class TestSessionConfig extends SessionConfig {
  override get secret(): string {
    return 'test-session-secret-key-for-testing';
  }

  override get ttlSec(): number {
    return 3600;
  }

  override get cookieOptions() {
    return {
      httpOnly: true,
      secure: false,
      sameSite: 'Lax' as const,
      path: '/',
    };
  }
}

@Controller('/session')
@UseMiddleware(SessionMiddleware)
class SessionTestController {
  @Get('/')
  get() {
    const session = getSession();
    return { session, isNew: isNewSession() };
  }

  @Post('/login')
  login() {
    setSession({ userId: 'user-123', count: 1 });
    return { success: true };
  }

  @Post('/login-with-cookie')
  loginWithCookie(res = response()) {
    res.setCookie('app', 'value', { path: '/' });
    setSession({ userId: 'user-123', count: 1 });
    return { success: true };
  }

  @Post('/increment')
  increment() {
    const session = getSession();
    if (session) {
      setSession({ ...session, count: (session.count ?? 0) + 1 });
    }
    return { count: getSession()?.count };
  }

  @Post('/logout')
  logout() {
    destroySession();
    return { success: true };
  }
}

describe('SessionMiddleware', () => {
  const buildApp = async () => {
    const app = createApp([http({ controllers: [SessionTestController] })], {
      configs: [TestSessionConfig],
    });
    const readyApp = await app.createRuntime();
    return readyApp;
  };

  const extractCookie = (res: Response): string | undefined => {
    const setCookie = res.headers.get('Set-Cookie');
    if (!setCookie) return undefined;
    const match = /sid=([^;]+)/.exec(setCookie);
    return match?.[1];
  };

  it('should create a new session on first request', async () => {
    const app = await buildApp();
    const res = await app.http.request('/session/');

    expect(res.status).toBe(200);
    const body = (await res.json()) as { session: SessionSchema | undefined; isNew: boolean };
    expect(body.isNew).toBe(true);
    expect(body.session).toEqual({});
  });

  it('should set session data via setSession', async () => {
    const app = await buildApp();
    const loginRes = await app.http.request('/session/login', { method: 'POST' });

    expect(loginRes.status).toBe(200);
    const cookie = extractCookie(loginRes);
    expect(cookie).toBeDefined();

    const getRes = await app.http.request('/session/', {
      headers: { Cookie: `sid=${cookie}` },
    });
    const body = (await getRes.json()) as { session: SessionSchema };
    expect(body.session.userId).toBe('user-123');
    expect(body.session.count).toBe(1);
  });

  it('should append the session cookie without replacing existing cookies', async () => {
    const app = await buildApp();
    const res = await app.http.request('/session/login-with-cookie', { method: 'POST' });

    expect(res.headers.get('Set-Cookie')).toContain('app=value');
    expect(res.headers.get('Set-Cookie')).toContain('sid=');
  });

  it('should persist session across requests', async () => {
    const app = await buildApp();

    const loginRes = await app.http.request('/session/login', { method: 'POST' });
    const cookie = extractCookie(loginRes);

    await app.http.request('/session/increment', {
      method: 'POST',
      headers: { Cookie: `sid=${cookie}` },
    });

    await app.http.request('/session/increment', {
      method: 'POST',
      headers: { Cookie: `sid=${cookie}` },
    });

    const getRes = await app.http.request('/session/', {
      headers: { Cookie: `sid=${cookie}` },
    });
    const body = (await getRes.json()) as { session: SessionSchema };
    expect(body.session.count).toBe(3);
  });

  it('should destroy session on logout', async () => {
    const app = await buildApp();

    const loginRes = await app.http.request('/session/login', { method: 'POST' });
    const cookie = extractCookie(loginRes);

    const logoutRes = await app.http.request('/session/logout', {
      method: 'POST',
      headers: { Cookie: `sid=${cookie}` },
    });
    expect(logoutRes.status).toBe(200);

    const getRes = await app.http.request('/session/', {
      headers: { Cookie: `sid=${cookie}` },
    });
    const body = (await getRes.json()) as { session: SessionSchema | undefined; isNew: boolean };
    expect(body.isNew).toBe(true);
    expect(body.session).toEqual({});
  });

  it('should reject tampered cookies', async () => {
    const app = await buildApp();

    const loginRes = await app.http.request('/session/login', { method: 'POST' });
    const cookie = extractCookie(loginRes);
    const tamperedCookie = `${cookie?.slice(0, -5)}xxxxx`;

    const getRes = await app.http.request('/session/', {
      headers: { Cookie: `sid=${tamperedCookie}` },
    });
    const body = (await getRes.json()) as { isNew: boolean };
    expect(body.isNew).toBe(true);
  });

  it('should create new session for invalid cookie format', async () => {
    const app = await buildApp();

    const getRes = await app.http.request('/session/', {
      headers: { Cookie: 'sid=invalid-no-signature' },
    });
    const body = (await getRes.json()) as { isNew: boolean };
    expect(body.isNew).toBe(true);
  });
});
