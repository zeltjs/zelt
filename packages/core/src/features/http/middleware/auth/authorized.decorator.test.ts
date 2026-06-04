import { describe, expect, it } from 'vitest';

import { createApp } from '../../../../app';
import { http } from '../../http.feature';
import { Controller } from '../../routing/controller.decorator';
import { Get } from '../../routing/http-method.decorator';
import type { FunctionMiddleware } from '../middleware.types';
import { setUser } from './auth.lib';
import { Authorized } from './authorized.decorator';

const authMiddleware: FunctionMiddleware = async (c, next) => {
  const authHeader = c.req.header('Authorization');
  if (authHeader === 'Bearer valid-token') {
    setUser({ id: 1, name: 'alice' }, ['user']);
  } else if (authHeader === 'Bearer admin-token') {
    setUser({ id: 2, name: 'admin' }, ['admin', 'user']);
  }
  await next();
};

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

    const app = createApp([
      http({
        controllers: [TestController],
        middlewares: [authMiddleware],
      }),
    ]);
    const readyApp = await app.ready();

    const res = await readyApp.http.request('/test/');
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

    const app = createApp([
      http({
        controllers: [TestController],
        middlewares: [authMiddleware],
      }),
    ]);
    const readyApp = await app.ready();

    const res = await readyApp.http.request('/test/', {
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

    const app = createApp([
      http({
        controllers: [AdminController],
        middlewares: [authMiddleware],
      }),
    ]);
    const readyApp = await app.ready();

    const res = await readyApp.http.request('/admin/', {
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

    const app = createApp([
      http({
        controllers: [AdminController],
        middlewares: [authMiddleware],
      }),
    ]);
    const readyApp = await app.ready();

    const res = await readyApp.http.request('/admin/', {
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

    const app = createApp([
      http({
        controllers: [ContentController],
        middlewares: [authMiddleware],
      }),
    ]);
    const readyApp = await app.ready();

    const res = await readyApp.http.request('/content/', {
      headers: { Authorization: 'Bearer admin-token' },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ content: 'editable' });
  });
});
