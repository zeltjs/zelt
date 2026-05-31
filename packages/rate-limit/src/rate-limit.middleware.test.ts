import { Config, Controller, createApp, Get, http } from '@zeltjs/core';
import { onTest } from '@zeltjs/testing';
import { describe, expect, it } from 'vitest';

import { RateLimitConfig } from './rate-limit.config';
import { RateLimit } from './rate-limit.middleware';

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

    const app = createApp([http({ controllers: [TestController] })]);
    const readyApp = await app.ready();

    const r1 = await readyApp.http.request('/limited');
    expect(r1.status).toBe(200);

    const r2 = await readyApp.http.request('/limited');
    expect(r2.status).toBe(200);

    const r3 = await readyApp.http.request('/limited');
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
    const app = createApp([http({ controllers: [TestController] })]);
    const readyApp = await app.ready();
    const res = await readyApp.http.request('/headers');
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
    const app = createApp([http({ controllers: [TestController] })]);
    const readyApp = await app.ready();
    const r1 = await readyApp.http.request('/dyn');
    const r2 = await readyApp.http.request('/dyn');
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
  });

  it('skips rate limiting when enabled is false', async () => {
    @Config
    class DisabledRateLimitConfig extends RateLimitConfig {
      override readonly enabled = false;
    }

    @Controller('/')
    class TestController {
      @Get('/disabled')
      @RateLimit({ limit: 1, windowSec: 60, key: 'test:disabled' })
      hit() {
        return { ok: true };
      }
    }

    const app = createApp([http({ controllers: [TestController] })]);
    const testApp = await onTest(app, { configs: [DisabledRateLimitConfig] });

    const r1 = await testApp.http.request('/disabled');
    const r2 = await testApp.http.request('/disabled');
    const r3 = await testApp.http.request('/disabled');
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    expect(r3.status).toBe(200);
    expect(r1.headers.get('X-RateLimit-Limit')).toBeNull();
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
    const app = createApp([http({ controllers: [TestController] })]);
    const readyApp = await app.ready();
    const r1 = await readyApp.http.request('/stack');
    expect(r1.status).toBe(200);
    const r2 = await readyApp.http.request('/stack');
    expect(r2.status).toBe(429);
  });
});
