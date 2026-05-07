import { Controller, Get, createHttpApp } from '@zeltjs/core';
import { describe, expect, it } from 'vitest';

import { RateLimit } from './rate-limit.decorator';

describe('@RateLimit decorator', () => {
  it('allows requests within limit, blocks after', async () => {
    @Controller('/')
    class TestController {
      @Get('/limited')
      @RateLimit({ limit: 2, windowSec: 60, key: 'test:limited' })
      hit() {
        return { ok: true };
      }
    }

    const app = await createHttpApp({ controllers: [TestController] });

    const r1 = await app.request('/limited');
    expect(r1.status).toBe(200);

    const r2 = await app.request('/limited');
    expect(r2.status).toBe(200);

    const r3 = await app.request('/limited');
    expect(r3.status).toBe(429);
    expect(r3.headers.get('Retry-After')).toBe('60');
  });

  it('sets X-RateLimit headers on success', async () => {
    @Controller('/')
    class TestController {
      @Get('/headers')
      @RateLimit({ limit: 5, windowSec: 60, key: 'test:headers' })
      hit() {
        return { ok: true };
      }
    }
    const app = await createHttpApp({ controllers: [TestController] });
    const res = await app.request('/headers');
    expect(res.headers.get('X-RateLimit-Limit')).toBe('5');
    expect(res.headers.get('X-RateLimit-Remaining')).toBe('4');
  });

  it('evaluates dynamic key function per request', async () => {
    let counter = 0;
    @Controller('/')
    class TestController {
      @Get('/dyn')
      @RateLimit({
        limit: 1,
        windowSec: 60,
        key: () => `test:dyn:${counter++}`,
      })
      hit() {
        return { ok: true };
      }
    }
    const app = await createHttpApp({ controllers: [TestController] });
    // Different keys per request → both succeed
    const r1 = await app.request('/dyn');
    const r2 = await app.request('/dyn');
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
  });

  it('stacking: both decorators must allow', async () => {
    @Controller('/')
    class TestController {
      @Get('/stack')
      @RateLimit({ limit: 10, windowSec: 60, key: 'test:stack:loose' })
      @RateLimit({ limit: 1, windowSec: 60, key: 'test:stack:strict' })
      hit() {
        return { ok: true };
      }
    }
    const app = await createHttpApp({ controllers: [TestController] });
    const r1 = await app.request('/stack');
    expect(r1.status).toBe(200);
    const r2 = await app.request('/stack');
    // strict limit (1) blocks the second
    expect(r2.status).toBe(429);
  });
});
