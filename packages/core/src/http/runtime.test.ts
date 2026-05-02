import { injectable } from '@needle-di/core';
import * as v from 'valibot';
import { describe, expect, it } from 'vitest';

import { createApp } from '../application';
import { Controller } from '../decorators/controller';
import { Get, Post } from '../decorators/http-method';
import { inject } from '../primitives/inject';
import { pathParam } from '../primitives/path-param';
import { validated } from '../primitives/validated';

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

const buildWorker = () => {
  const app = createApp({
    providers: [Greeter, HelloController, EchoController],
  });
  return app.http({ controllers: [HelloController, EchoController] }).toWorker();
};

describe('app.http().toWorker()', () => {
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

  it('throws at app.http() construction when a controller is missing @Controller', () => {
    class NoDecorator {
      @Get('/')
      list() {}
    }
    new NoDecorator();
    const app = createApp({ providers: [] });
    expect(() => app.http({ controllers: [NoDecorator] }).toWorker()).toThrow(
      /missing @Controller/,
    );
  });
});
