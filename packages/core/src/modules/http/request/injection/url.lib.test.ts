import { describe, expect, it } from 'vitest';
import { createApp } from '../../../../app';
import { http } from '../../../../features/http.feature';
import { Controller } from '../../routing/controller.decorator';
import { Get, Post } from '../../routing/http-method.decorator';

import { method, path, url } from './url.lib';

describe('url', () => {
  it('returns full request URL', async () => {
    @Controller('/')
    class TestController {
      @Get('/info')
      info(u = url()) {
        return { url: u };
      }
    }

    const app = createApp([http({ controllers: [TestController] })]);
    const readyApp = await app.ready();
    const res = await readyApp.http.fetch(new Request('http://localhost/info?foo=bar'));
    expect(await res.json()).toEqual({ url: 'http://localhost/info?foo=bar' });
  });
});

describe('path', () => {
  it('returns request path', async () => {
    @Controller('/')
    class TestController {
      @Get('/users/:id')
      user(p = path()) {
        return { path: p };
      }
    }

    const app = createApp([http({ controllers: [TestController] })]);
    const readyApp = await app.ready();
    const res = await readyApp.http.fetch(new Request('http://localhost/users/123?include=profile'));
    expect(await res.json()).toEqual({ path: '/users/123' });
  });
});

describe('method', () => {
  it('returns HTTP method', async () => {
    @Controller('/')
    class TestController {
      @Get('/test')
      getTest(m = method()) {
        return { method: m };
      }

      @Post('/test')
      postTest(m = method()) {
        return { method: m };
      }
    }

    const app = createApp([http({ controllers: [TestController] })]);
    const readyApp = await app.ready();

    const getRes = await readyApp.http.fetch(new Request('http://localhost/test'));
    expect(await getRes.json()).toEqual({ method: 'GET' });

    const postRes = await readyApp.http.fetch(new Request('http://localhost/test', { method: 'POST' }));
    expect(await postRes.json()).toEqual({ method: 'POST' });
  });
});
