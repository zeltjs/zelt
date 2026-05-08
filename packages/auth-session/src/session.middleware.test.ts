import { describe, it, expect } from 'vitest';
import { Controller, Get, Post, UseMiddleware, createHttpApp, inject } from '@zeltjs/core';
import { MemoryKV } from '@zeltjs/kv';
import type { KVStore } from '@zeltjs/kv';

import { SessionMiddleware } from './session.middleware';
import { SessionConfig } from './session.config';
import { getSession, setSession, destroySession, isNewSession } from './session.functions.lib';
import type { SessionData } from './session.types';

interface TestSession extends SessionData {
  userId?: string;
  count?: number;
}

class TestSessionConfig extends SessionConfig {
  private readonly memoryKV = inject(MemoryKV);

  override get store(): KVStore {
    return this.memoryKV.namespace('test:').unwrapOr(null as never);
  }

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
    const session = getSession<TestSession>();
    return { session, isNew: isNewSession() };
  }

  @Post('/login')
  login() {
    setSession<TestSession>({ userId: 'user-123', count: 1 });
    return { success: true };
  }

  @Post('/increment')
  increment() {
    const session = getSession<TestSession>();
    if (session) {
      setSession<TestSession>({ ...session, count: (session.count ?? 0) + 1 });
    }
    return { count: getSession<TestSession>()?.count };
  }

  @Post('/logout')
  logout() {
    destroySession();
    return { success: true };
  }
}

describe('SessionMiddleware', () => {
  const buildApp = async () => {
    const app = createHttpApp({
      controllers: [SessionTestController],
      configs: [TestSessionConfig],
    });
    await app.ready();
    return app;
  };

  const extractCookie = (res: Response): string | undefined => {
    const setCookie = res.headers.get('Set-Cookie');
    if (!setCookie) return undefined;
    const match = /sid=([^;]+)/.exec(setCookie);
    return match?.[1];
  };

  it('should create a new session on first request', async () => {
    const app = await buildApp();
    const res = await app.request('/session/');

    expect(res.status).toBe(200);
    const body = (await res.json()) as { session: TestSession | undefined; isNew: boolean };
    expect(body.isNew).toBe(true);
    expect(body.session).toEqual({});
  });

  it('should set session data via setSession', async () => {
    const app = await buildApp();
    const loginRes = await app.request('/session/login', { method: 'POST' });

    expect(loginRes.status).toBe(200);
    const cookie = extractCookie(loginRes);
    expect(cookie).toBeDefined();

    const getRes = await app.request('/session/', {
      headers: { Cookie: `sid=${cookie}` },
    });
    const body = (await getRes.json()) as { session: TestSession };
    expect(body.session.userId).toBe('user-123');
    expect(body.session.count).toBe(1);
  });

  it('should persist session across requests', async () => {
    const app = await buildApp();

    const loginRes = await app.request('/session/login', { method: 'POST' });
    const cookie = extractCookie(loginRes);

    await app.request('/session/increment', {
      method: 'POST',
      headers: { Cookie: `sid=${cookie}` },
    });

    await app.request('/session/increment', {
      method: 'POST',
      headers: { Cookie: `sid=${cookie}` },
    });

    const getRes = await app.request('/session/', {
      headers: { Cookie: `sid=${cookie}` },
    });
    const body = (await getRes.json()) as { session: TestSession };
    expect(body.session.count).toBe(3);
  });

  it('should destroy session on logout', async () => {
    const app = await buildApp();

    const loginRes = await app.request('/session/login', { method: 'POST' });
    const cookie = extractCookie(loginRes);

    const logoutRes = await app.request('/session/logout', {
      method: 'POST',
      headers: { Cookie: `sid=${cookie}` },
    });
    expect(logoutRes.status).toBe(200);

    const getRes = await app.request('/session/', {
      headers: { Cookie: `sid=${cookie}` },
    });
    const body = (await getRes.json()) as { session: TestSession | undefined; isNew: boolean };
    expect(body.isNew).toBe(true);
    expect(body.session).toEqual({});
  });

  it('should reject tampered cookies', async () => {
    const app = await buildApp();

    const loginRes = await app.request('/session/login', { method: 'POST' });
    const cookie = extractCookie(loginRes);
    const tamperedCookie = `${cookie?.slice(0, -5)}xxxxx`;

    const getRes = await app.request('/session/', {
      headers: { Cookie: `sid=${tamperedCookie}` },
    });
    const body = (await getRes.json()) as { isNew: boolean };
    expect(body.isNew).toBe(true);
  });

  it('should create new session for invalid cookie format', async () => {
    const app = await buildApp();

    const getRes = await app.request('/session/', {
      headers: { Cookie: 'sid=invalid-no-signature' },
    });
    const body = (await getRes.json()) as { isNew: boolean };
    expect(body.isNew).toBe(true);
  });
});
