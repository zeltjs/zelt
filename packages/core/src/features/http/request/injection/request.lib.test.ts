import { describe, expect, it } from 'vitest';

import { createApp } from '../../../../app';
import { http } from '../../http.feature';
import { Controller } from '../../routing/controller.decorator';
import { Get } from '../../routing/http-method.decorator';
import { request } from './request.lib';

describe('request() — sync accessors', () => {
  it('returns HTTP method', async () => {
    @Controller('/')
    class C {
      @Get('/test')
      handle(req = request()) {
        return { method: req.method() };
      }
    }

    const app = createApp([http({ controllers: [C] })]);
    const ready = await app.createRuntime();
    const res = await ready.http.fetch(new Request('http://localhost/test'));
    expect(await res.json()).toEqual({ method: 'GET' });
  });

  it('returns request path', async () => {
    @Controller('/')
    class C {
      @Get('/users/:id')
      handle(req = request()) {
        return { path: req.path() };
      }
    }

    const app = createApp([http({ controllers: [C] })]);
    const ready = await app.createRuntime();
    const res = await ready.http.fetch(new Request('http://localhost/users/42?x=1'));
    expect(await res.json()).toEqual({ path: '/users/42' });
  });

  it('returns full URL', async () => {
    @Controller('/')
    class C {
      @Get('/info')
      handle(req = request()) {
        return { url: req.url() };
      }
    }

    const app = createApp([http({ controllers: [C] })]);
    const ready = await app.createRuntime();
    const res = await ready.http.fetch(new Request('http://localhost/info?foo=bar'));
    expect(await res.json()).toEqual({ url: 'http://localhost/info?foo=bar' });
  });

  it('returns path param', async () => {
    @Controller('/')
    class C {
      @Get('/users/:id')
      handle(req = request()) {
        return { id: req.pathParam('id') };
      }
    }

    const app = createApp([http({ controllers: [C] })]);
    const ready = await app.createRuntime();
    const res = await ready.http.fetch(new Request('http://localhost/users/42'));
    expect(await res.json()).toEqual({ id: '42' });
  });

  it('throws for missing path param', async () => {
    @Controller('/')
    class C {
      @Get('/')
      handle(req = request()) {
        return { id: req.pathParam('nonexistent') };
      }
    }

    const app = createApp([http({ controllers: [C] })]);
    const ready = await app.createRuntime();
    const res = await ready.http.fetch(new Request('http://localhost/'));
    expect(res.status).toBe(500);
  });

  it('returns query param', async () => {
    @Controller('/')
    class C {
      @Get('/search')
      handle(req = request()) {
        return { q: req.queryParam('q') ?? 'default' };
      }
    }

    const app = createApp([http({ controllers: [C] })]);
    const ready = await app.createRuntime();
    const res = await ready.http.fetch(new Request('http://localhost/search?q=hello'));
    expect(await res.json()).toEqual({ q: 'hello' });
  });

  it('returns multiple query params', async () => {
    @Controller('/')
    class C {
      @Get('/filter')
      handle(req = request()) {
        return { tags: req.queryParams('tag') };
      }
    }

    const app = createApp([http({ controllers: [C] })]);
    const ready = await app.createRuntime();
    const res = await ready.http.fetch(new Request('http://localhost/filter?tag=a&tag=b'));
    expect(await res.json()).toEqual({ tags: ['a', 'b'] });
  });

  it('returns empty array for missing query params', async () => {
    @Controller('/')
    class C {
      @Get('/filter')
      handle(req = request()) {
        return { tags: req.queryParams('tag') };
      }
    }

    const app = createApp([http({ controllers: [C] })]);
    const ready = await app.createRuntime();
    const res = await ready.http.fetch(new Request('http://localhost/filter'));
    expect(await res.json()).toEqual({ tags: [] });
  });

  it('returns header value', async () => {
    @Controller('/')
    class C {
      @Get('/')
      handle(req = request()) {
        return { ua: req.header('user-agent') };
      }
    }

    const app = createApp([http({ controllers: [C] })]);
    const ready = await app.createRuntime();
    const res = await ready.http.fetch(
      new Request('http://localhost/', { headers: { 'User-Agent': 'test-agent' } }),
    );
    expect(await res.json()).toEqual({ ua: 'test-agent' });
  });

  it('returns cookie value', async () => {
    @Controller('/')
    class C {
      @Get('/')
      handle(req = request()) {
        return { session: req.cookie('session') };
      }
    }

    const app = createApp([http({ controllers: [C] })]);
    const ready = await app.createRuntime();
    const res = await ready.http.fetch(
      new Request('http://localhost/', { headers: { Cookie: 'session=abc123' } }),
    );
    expect(await res.json()).toEqual({ session: 'abc123' });
  });

  it('returns client IP from cf-connecting-ip', async () => {
    @Controller('/')
    class C {
      @Get('/')
      handle(req = request()) {
        return { ip: req.ip() };
      }
    }

    const app = createApp([http({ controllers: [C] })]);
    const ready = await app.createRuntime();
    const res = await ready.http.fetch(
      new Request('http://localhost/', { headers: { 'cf-connecting-ip': '1.1.1.1' } }),
    );
    expect(await res.json()).toEqual({ ip: '1.1.1.1' });
  });
});
