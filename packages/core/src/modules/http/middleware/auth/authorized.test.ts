import { describe, expect, it } from 'vitest';

import { createApp } from '../../../../app';
import { header } from '../../request/injection/header';
import { Controller } from '../../routing/controller';
import { Get } from '../../routing/http-method';
import { Middleware } from '../middleware';
import type { Next } from '../types';
import { setUser } from './auth';
import { Authorized } from './authorized';

@Middleware
class AuthMiddleware {
  async use(next: Next) {
    const authHeader = header('Authorization');
    if (authHeader === 'Bearer valid-token') {
      setUser({ id: 1, name: 'alice' }, ['user']);
    } else if (authHeader === 'Bearer admin-token') {
      setUser({ id: 2, name: 'admin' }, ['admin', 'user']);
    }
    await next();
    return undefined;
  }
}

describe('@Authorized', () => {
  it('returns 401 when user is not authenticated', async () => {
    @Controller('/test')
    class TestController {
      @Authorized()
      @Get('/')
      get() {
        return { ok: true };
      }
    }

    const app = createApp({
      http: {
        controllers: [TestController],
        middlewares: [AuthMiddleware],
      },
    });
    await app.ready();

    const res = await app.request('/test/');
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({
      code: 'UNAUTHORIZED',
      message: 'Authentication required',
    });
  });

  it('allows access when user is authenticated', async () => {
    @Controller('/test')
    class TestController {
      @Authorized()
      @Get('/')
      get() {
        return { ok: true };
      }
    }

    const app = createApp({
      http: {
        controllers: [TestController],
        middlewares: [AuthMiddleware],
      },
    });
    await app.ready();

    const res = await app.request('/test/', {
      headers: { Authorization: 'Bearer valid-token' },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('returns 403 when user lacks required role', async () => {
    @Controller('/admin')
    class AdminController {
      @Authorized(['admin'])
      @Get('/')
      get() {
        return { secret: 'data' };
      }
    }

    const app = createApp({
      http: {
        controllers: [AdminController],
        middlewares: [AuthMiddleware],
      },
    });
    await app.ready();

    const res = await app.request('/admin/', {
      headers: { Authorization: 'Bearer valid-token' },
    });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({
      code: 'FORBIDDEN',
      message: 'Insufficient permissions',
    });
  });

  it('allows access when user has required role', async () => {
    @Controller('/admin')
    class AdminController {
      @Authorized(['admin'])
      @Get('/')
      get() {
        return { secret: 'data' };
      }
    }

    const app = createApp({
      http: {
        controllers: [AdminController],
        middlewares: [AuthMiddleware],
      },
    });
    await app.ready();

    const res = await app.request('/admin/', {
      headers: { Authorization: 'Bearer admin-token' },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ secret: 'data' });
  });

  it('allows access when user has one of multiple required roles', async () => {
    @Controller('/content')
    class ContentController {
      @Authorized(['editor', 'admin'])
      @Get('/')
      get() {
        return { content: 'editable' };
      }
    }

    const app = createApp({
      http: {
        controllers: [ContentController],
        middlewares: [AuthMiddleware],
      },
    });
    await app.ready();

    const res = await app.request('/content/', {
      headers: { Authorization: 'Bearer admin-token' },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ content: 'editable' });
  });
});
