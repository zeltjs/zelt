import { injectable } from '@needle-di/core';
import * as v from 'valibot';
import { describe, expect, it } from 'vitest';

import { Controller } from '../decorators/controller';
import { Get, Post } from '../decorators/http-method';
import { inject } from '../primitives/inject';
import { pathParam } from '../primitives/path-param';
import { validated } from '../primitives/validated';

import { createHttpApp } from './app';

@injectable()
class Greeter {
  greet(name: string) {
    return `hello, ${name}`;
  }
}

@Controller('/hello')
class HelloController {
  constructor(private greeter = inject(Greeter)) {}

  @Get('/:name')
  greet() {
    return { message: this.greeter.greet(pathParam('name')) };
  }
}

@Controller('/echo')
class EchoController {
  @Post('/')
  create() {
    return validated(v.object({ msg: v.string() }));
  }
}

const buildWorker = () =>
  createHttpApp({ controllers: [HelloController, EchoController] }).toWorker();

describe('createHttpApp().toWorker()', () => {
  it('serves a constructor-injected GET endpoint with pathParam', async () => {
    const worker = buildWorker();
    const res = await worker.fetch(new Request('https://example.com/hello/koya'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ message: 'hello, koya' });
  });

  it('parses JSON body via validated()', async () => {
    const worker = buildWorker();
    const res = await worker.fetch(
      new Request('https://example.com/echo/', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ msg: 'ok' }),
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ msg: 'ok' });
  });

  it('mounts multiple controllers under different base paths', async () => {
    const worker = buildWorker();
    const a = await worker.fetch(new Request('https://example.com/hello/x'));
    const b = await worker.fetch(
      new Request('https://example.com/echo/', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ msg: 'y' }),
      }),
    );
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
  });

  it('throws at createHttpApp() construction when a controller is missing @Controller', () => {
    class NoDecorator {
      @Get('/')
      list() {}
    }
    new NoDecorator();
    expect(() => createHttpApp({ controllers: [NoDecorator] }).toWorker()).toThrow(
      /missing @Controller/,
    );
  });
});

describe('error paths', () => {
  it('returns 400 when validated() rejects the body', async () => {
    const worker = buildWorker();
    const res = await worker.fetch(
      new Request('https://example.com/echo/', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ msg: 42 }),
      }),
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 for malformed JSON body (validated() sees undefined)', async () => {
    const worker = buildWorker();
    const res = await worker.fetch(
      new Request('https://example.com/echo/', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: 'not-json',
      }),
    );
    expect(res.status).toBe(400);
  });

  it('returns 500 when pathParam() asks for a missing parameter', async () => {
    @Controller('/x')
    class BrokenController {
      @Get('/')
      run() {
        return { v: pathParam('id') };
      }
    }
    const w = createHttpApp({ controllers: [BrokenController] }).toWorker();
    const res = await w.fetch(new Request('https://example.com/x/'));
    expect(res.status).toBe(500);
  });
});
