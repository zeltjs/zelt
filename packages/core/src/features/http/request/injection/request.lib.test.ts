import { describe, expect, it } from 'vitest';

import { createApp } from '../../../../app';
import { http } from '../../http.feature';
import { Controller } from '../../routing/controller.decorator';
import { Get, Post } from '../../routing/http-method.decorator';
import { request } from './request.lib';
import { createStandardSchema } from './test.lib';

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

const userSchema = createStandardSchema<{ name: string; age: number }>({
  validate: (value) => {
    if (
      typeof value === 'object' &&
      value !== null &&
      'name' in value &&
      'age' in value &&
      typeof value.name === 'string' &&
      typeof value.age === 'number'
    ) {
      return { value: { name: value.name, age: value.age } };
    }
    return { issues: [{ message: 'Invalid user' }] };
  },
});

describe('request() — async body', () => {
  it('returns raw JSON body without schema', async () => {
    @Controller('/')
    class C {
      @Post('/json')
      async handle(req = request()) {
        const data = await req.body();
        return data;
      }
    }

    const app = createApp([http({ controllers: [C] })]);
    const ready = await app.createRuntime();
    const res = await ready.http.fetch(
      new Request('http://localhost/json', {
        method: 'POST',
        body: JSON.stringify({ name: 'test' }),
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    expect(await res.json()).toEqual({ name: 'test' });
  });

  it('returns raw body text for signed JSON payloads', async () => {
    @Controller('/')
    class C {
      @Post('/json')
      handle(req = request()) {
        return { raw: req.bodyRaw() };
      }
    }

    const raw = '{ "name": "test", "sig": "preserve whitespace" }';
    const app = createApp([http({ controllers: [C] })]);
    const ready = await app.createRuntime();
    const res = await ready.http.fetch(
      new Request('http://localhost/json', {
        method: 'POST',
        body: raw,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    expect(await res.json()).toEqual({ raw });
  });

  it('returns undefined when body is absent', async () => {
    @Controller('/')
    class C {
      @Get('/')
      async handle(req = request()) {
        const data = await req.body();
        return { hasBody: data !== undefined };
      }
    }

    const app = createApp([http({ controllers: [C] })]);
    const ready = await app.createRuntime();
    const res = await ready.http.fetch(new Request('http://localhost/'));
    expect(await res.json()).toEqual({ hasBody: false });
  });

  it('returns 400 when body is absent for a schema request', async () => {
    @Controller('/')
    class C {
      @Post('/validated')
      async handle(req = request(userSchema)) {
        return await req.body();
      }
    }

    const app = createApp([http({ controllers: [C] })]);
    const ready = await app.createRuntime();
    const res = await ready.http.fetch(
      new Request('http://localhost/validated', { method: 'POST' }),
    );
    expect(res.status).toBe(400);
    const json = (await res.json()) as { code: string };
    expect(json.code).toBe('VALIDATION_FAILED');
  });

  it('validates and returns typed body with schema', async () => {
    @Controller('/')
    class C {
      @Post('/validated')
      async handle(req = request(userSchema)) {
        const data = await req.body();
        return data;
      }
    }

    const app = createApp([http({ controllers: [C] })]);
    const ready = await app.createRuntime();
    const res = await ready.http.fetch(
      new Request('http://localhost/validated', {
        method: 'POST',
        body: JSON.stringify({ name: 'Ada', age: 36 }),
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ name: 'Ada', age: 36 });
  });

  it('returns 400 when validation fails', async () => {
    @Controller('/')
    class C {
      @Post('/validated')
      async handle(req = request(userSchema)) {
        return await req.body();
      }
    }

    const app = createApp([http({ controllers: [C] })]);
    const ready = await app.createRuntime();
    const res = await ready.http.fetch(
      new Request('http://localhost/validated', {
        method: 'POST',
        body: JSON.stringify({ name: 'Ada' }),
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    expect(res.status).toBe(400);
    const json = (await res.json()) as { code: string };
    expect(json.code).toBe('VALIDATION_FAILED');
  });

  it('returns 500 when schema validation is async', async () => {
    const asyncSchema = createStandardSchema<{ ok: true }>({
      validate: async () => ({ value: { ok: true } }),
    });

    @Controller('/')
    class C {
      @Post('/async-schema')
      async handle(req = request(asyncSchema)) {
        return await req.body();
      }
    }

    const app = createApp([http({ controllers: [C] })]);
    const ready = await app.createRuntime();
    const res = await ready.http.fetch(
      new Request('http://localhost/async-schema', {
        method: 'POST',
        body: JSON.stringify({ ok: true }),
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    expect(res.status).toBe(500);
    const json = (await res.json()) as { code: string };
    expect(json.code).toBe('ASYNC_VALIDATION_UNSUPPORTED');
  });

  it('validates form body with target option', async () => {
    const formSchema = createStandardSchema<{ name: string }>({
      validate: (value) => {
        if (typeof value === 'object' && value !== null && 'name' in value) {
          return { value: { name: String(value.name) } };
        }
        return { issues: [{ message: 'Invalid form' }] };
      },
    });

    @Controller('/')
    class C {
      @Post('/form')
      async handle(req = request(formSchema, { target: 'form' })) {
        return await req.body();
      }
    }

    const app = createApp([http({ controllers: [C] })]);
    const ready = await app.createRuntime();
    const formData = new FormData();
    formData.append('name', 'Ada');
    const res = await ready.http.fetch(
      new Request('http://localhost/form', { method: 'POST', body: formData }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ name: 'Ada' });
  });

  it('returns 415 when raw multipart body is requested', async () => {
    @Controller('/')
    class C {
      @Post('/form')
      handle(req = request()) {
        return { raw: req.bodyRaw() };
      }
    }

    const app = createApp([http({ controllers: [C] })]);
    const ready = await app.createRuntime();
    const formData = new FormData();
    formData.append('name', 'Ada');
    const res = await ready.http.fetch(
      new Request('http://localhost/form', { method: 'POST', body: formData }),
    );
    expect(res.status).toBe(415);
  });

  it('returns 415 when content-type mismatches target', async () => {
    @Controller('/')
    class C {
      @Post('/json')
      async handle(req = request()) {
        return await req.body();
      }
    }

    const app = createApp([http({ controllers: [C] })]);
    const ready = await app.createRuntime();
    const res = await ready.http.fetch(
      new Request('http://localhost/json', {
        method: 'POST',
        body: 'plain text',
        headers: { 'Content-Type': 'text/plain' },
      }),
    );
    expect(res.status).toBe(415);
  });

  it('body() is idempotent when called twice', async () => {
    @Controller('/')
    class C {
      @Post('/twice')
      async handle(req = request(userSchema)) {
        const a = await req.body();
        const b = await req.body();
        return { same: JSON.stringify(a) === JSON.stringify(b) };
      }
    }

    const app = createApp([http({ controllers: [C] })]);
    const ready = await app.createRuntime();
    const res = await ready.http.fetch(
      new Request('http://localhost/twice', {
        method: 'POST',
        body: JSON.stringify({ name: 'Ada', age: 36 }),
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    expect(await res.json()).toEqual({ same: true });
  });

  it('works when called in method body (not default parameter)', async () => {
    @Controller('/')
    class C {
      @Post('/body-call')
      async handle() {
        const req = request(userSchema);
        const data = await req.body();
        return data;
      }
    }

    const app = createApp([http({ controllers: [C] })]);
    const ready = await app.createRuntime();
    const res = await ready.http.fetch(
      new Request('http://localhost/body-call', {
        method: 'POST',
        body: JSON.stringify({ name: 'Ada', age: 36 }),
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ name: 'Ada', age: 36 });
  });
});
