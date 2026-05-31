import { describe, expect, it } from 'vitest';
import { createApp } from '../../../app';
import { http } from '../../../features/http.feature';
import { Controller } from '../routing/controller.decorator';
import { Post } from '../routing/http-method.decorator';

import { response } from './response.lib';

describe('response.setCookie', () => {
  it('sets a cookie', async () => {
    @Controller('/')
    class TestController {
      @Post('/login')
      login(res = response()) {
        return res.setCookie('session', 'abc123').json({ ok: true });
      }
    }

    const app = createApp([http({ controllers: [TestController] })]);
    const readyApp = await app.ready();
    const res = await readyApp.http.fetch(new Request('http://localhost/login', { method: 'POST' }));

    expect(res.headers.get('Set-Cookie')).toBe('session=abc123; Path=/');
    expect(await res.json()).toEqual({ ok: true });
  });

  it('sets a cookie with options', async () => {
    @Controller('/')
    class TestController {
      @Post('/login')
      login(res = response()) {
        return res
          .setCookie('session', 'abc123', {
            httpOnly: true,
            secure: true,
            maxAge: 3600,
            path: '/',
          })
          .json({ ok: true });
      }
    }

    const app = createApp([http({ controllers: [TestController] })]);
    const readyApp = await app.ready();
    const res = await readyApp.http.fetch(new Request('http://localhost/login', { method: 'POST' }));

    const cookie = res.headers.get('Set-Cookie');
    expect(cookie).toContain('session=abc123');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Secure');
    expect(cookie).toContain('Max-Age=3600');
  });
});

describe('response.deleteCookie', () => {
  it('deletes a cookie', async () => {
    @Controller('/')
    class TestController {
      @Post('/logout')
      logout(res = response()) {
        return res.deleteCookie('session').json({ ok: true });
      }
    }

    const app = createApp([http({ controllers: [TestController] })]);
    const readyApp = await app.ready();
    const res = await readyApp.http.fetch(new Request('http://localhost/logout', { method: 'POST' }));

    const cookie = res.headers.get('Set-Cookie');
    expect(cookie).toContain('session=');
    expect(cookie).toContain('Max-Age=0');
  });
});
