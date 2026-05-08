import { describe, expect, it } from 'vitest';

import { Controller } from '../decorators/controller';
import { Post } from '../decorators/http-method';
import { createHttpApp } from '../http/app';

import { body } from './body';

describe('body', () => {
  it('parses text body', async () => {
    @Controller('/')
    class TestController {
      @Post('/text')
      async text() {
        const text = await body('text');
        return { text };
      }
    }

    const app = createHttpApp({ controllers: [TestController] });
    await app.ready();
    const res = await app.fetch(
      new Request('http://localhost/text', {
        method: 'POST',
        body: 'hello world',
        headers: { 'Content-Type': 'text/plain' },
      }),
    );
    expect(await res.json()).toEqual({ text: 'hello world' });
  });

  it('parses json body', async () => {
    @Controller('/')
    class TestController {
      @Post('/json')
      async json() {
        const data = await body('json');
        return { data };
      }
    }

    const app = createHttpApp({ controllers: [TestController] });
    await app.ready();
    const res = await app.fetch(
      new Request('http://localhost/json', {
        method: 'POST',
        body: JSON.stringify({ name: 'test' }),
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    expect(await res.json()).toEqual({ data: { name: 'test' } });
  });

  it('parses form body', async () => {
    @Controller('/')
    class TestController {
      @Post('/form')
      async form() {
        const formData = await body('form');
        return { name: formData.get('name') };
      }
    }

    const app = createHttpApp({ controllers: [TestController] });
    const formData = new FormData();
    formData.append('name', 'John');

    await app.ready();
    const res = await app.fetch(
      new Request('http://localhost/form', {
        method: 'POST',
        body: formData,
      }),
    );
    expect(await res.json()).toEqual({ name: 'John' });
  });

  it('parses arrayBuffer body', async () => {
    @Controller('/')
    class TestController {
      @Post('/buffer')
      async buffer() {
        const buf = await body('arrayBuffer');
        return { size: buf.byteLength };
      }
    }

    const app = createHttpApp({ controllers: [TestController] });
    await app.ready();
    const res = await app.fetch(
      new Request('http://localhost/buffer', {
        method: 'POST',
        body: new Uint8Array([1, 2, 3, 4, 5]),
      }),
    );
    expect(await res.json()).toEqual({ size: 5 });
  });

  it('parses blob body', async () => {
    @Controller('/')
    class TestController {
      @Post('/blob')
      async blob() {
        const b = await body('blob');
        return { size: b.size, type: b.type };
      }
    }

    const app = createHttpApp({ controllers: [TestController] });
    await app.ready();
    const res = await app.fetch(
      new Request('http://localhost/blob', {
        method: 'POST',
        body: new Blob(['hello'], { type: 'text/plain' }),
        headers: { 'Content-Type': 'text/plain' },
      }),
    );
    expect(await res.json()).toEqual({ size: 5, type: 'text/plain' });
  });
});
