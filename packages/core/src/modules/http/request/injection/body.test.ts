import { describe, expect, it } from 'vitest';
import { createApp } from '../../../../app';
import { Controller } from '../../routing/controller';
import { Post } from '../../routing/http-method';

import { body } from './body';

describe('body', () => {
  it('provides json body synchronously as default parameter', async () => {
    @Controller('/')
    class TestController {
      @Post('/json')
      json(data = body('json') as { name: string }) {
        return { receivedName: data.name };
      }
    }

    const app = createApp({ http: { controllers: [TestController] } });
    await app.ready();
    const res = await app.fetch(
      new Request('http://localhost/json', {
        method: 'POST',
        body: JSON.stringify({ name: 'test' }),
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    expect(await res.json()).toEqual({ receivedName: 'test' });
  });

  it('defaults to json type when no argument provided', async () => {
    @Controller('/')
    class TestController {
      @Post('/json')
      json(data = body() as { value: number }) {
        return { doubled: data.value * 2 };
      }
    }

    const app = createApp({ http: { controllers: [TestController] } });
    await app.ready();
    const res = await app.fetch(
      new Request('http://localhost/json', {
        method: 'POST',
        body: JSON.stringify({ value: 21 }),
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    expect(await res.json()).toEqual({ doubled: 42 });
  });

  it('provides form body synchronously as default parameter', async () => {
    @Controller('/')
    class TestController {
      @Post('/form')
      form(data = body('form')) {
        return { receivedName: data['name'] };
      }
    }

    const app = createApp({ http: { controllers: [TestController] } });
    const formData = new FormData();
    formData.append('name', 'John');

    await app.ready();
    const res = await app.fetch(
      new Request('http://localhost/form', {
        method: 'POST',
        body: formData,
      }),
    );
    expect(await res.json()).toEqual({ receivedName: 'John' });
  });

  it('provides text body synchronously as default parameter', async () => {
    @Controller('/')
    class TestController {
      @Post('/text')
      text(data = body('text')) {
        return { received: data, length: data.length };
      }
    }

    const app = createApp({ http: { controllers: [TestController] } });
    await app.ready();
    const res = await app.fetch(
      new Request('http://localhost/text', {
        method: 'POST',
        body: 'hello world',
        headers: { 'Content-Type': 'text/plain' },
      }),
    );
    expect(await res.json()).toEqual({ received: 'hello world', length: 11 });
  });

  it('throws error when body type mismatches content-type', async () => {
    @Controller('/')
    class TestController {
      @Post('/json')
      json(data = body('json')) {
        return { data };
      }
    }

    const app = createApp({ http: { controllers: [TestController] } });
    await app.ready();
    const res = await app.fetch(
      new Request('http://localhost/json', {
        method: 'POST',
        body: 'plain text',
        headers: { 'Content-Type': 'text/plain' },
      }),
    );
    expect(res.status).toBe(415);
  });
});
