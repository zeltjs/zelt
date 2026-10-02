import { Hono } from 'hono';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../../../../app';
import { http } from '../../http.feature';
import { response } from '../../response';
import { Controller } from '../../routing/controller.decorator';
import { Get } from '../../routing/http-method.decorator';
import { UseMiddleware } from '../use-middleware.decorator';
import { SecureHeadersConfig } from './secure-headers.config';
import { SecureHeadersMiddleware } from './secure-headers.middleware';

const applyMiddleware = (middleware: SecureHeadersMiddleware, downstream: Response) => {
  const app = new Hono();
  app.use((ctx, next) => middleware.use(next, ctx));
  app.get('/test', () => downstream);
  return app.request('/test');
};

describe('SecureHeadersMiddleware', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('copies the finalized response only once and preserves its body, status and cookies', async () => {
    const downstream = new Response('created', {
      status: 201,
      statusText: 'Created',
      headers: [
        ['X-Custom', 'keep'],
        ['X-Frame-Options', 'DENY'],
        ['X-Powered-By', 'zelt'],
        ['Set-Cookie', 'a=1'],
        ['Set-Cookie', 'b=2'],
      ],
    });
    const NativeResponse = Response;
    let copies = 0;
    class CountingResponse extends NativeResponse {
      constructor(body?: BodyInit | null, init?: ResponseInit) {
        super(body, init);
        copies++;
      }
    }
    vi.stubGlobal('Response', CountingResponse);

    const middleware = new SecureHeadersMiddleware(new SecureHeadersConfig());
    const res = await applyMiddleware(middleware, downstream);

    expect(copies).toBe(1);
    expect(res.status).toBe(201);
    expect(res.statusText).toBe('Created');
    expect(res.headers.get('X-Custom')).toBe('keep');
    expect(res.headers.get('X-Frame-Options')).toBe('SAMEORIGIN');
    expect(res.headers.get('X-Powered-By')).toBeNull();
    expect(res.headers.getSetCookie()).toEqual(['a=1', 'b=2']);
    expect(await res.text()).toBe('created');
  });

  it('updates immutable downstream headers while preserving the response', async () => {
    const downstream = await fetch('data:text/plain,immutable body');
    expect(() => downstream.headers.set('X-Test', 'value')).toThrow(TypeError);
    const middleware = new SecureHeadersMiddleware(new SecureHeadersConfig());

    const res = await applyMiddleware(middleware, downstream);

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('text/plain');
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(await res.text()).toBe('immutable body');
  });

  it('preserves disabled headers and X-Powered-By when removal is disabled', async () => {
    class CustomConfig extends SecureHeadersConfig {
      override readonly crossOriginEmbedderPolicy = 'credentialless';
      override readonly xFrameOptions = false;
      override readonly removePoweredBy = false;
    }
    const middleware = new SecureHeadersMiddleware(new CustomConfig());

    const res = await applyMiddleware(
      middleware,
      new Response('ok', { headers: { 'X-Frame-Options': 'DENY', 'X-Powered-By': 'zelt' } }),
    );

    expect(res.headers.get('Cross-Origin-Embedder-Policy')).toBe('credentialless');
    expect(res.headers.get('X-Frame-Options')).toBe('DENY');
    expect(res.headers.get('X-Powered-By')).toBe('zelt');
  });

  it.each([
    true,
    false,
  ])('handles all headers disabled with removePoweredBy=%s', async (removePoweredBy) => {
    class DisabledConfig extends SecureHeadersConfig {
      override readonly crossOriginEmbedderPolicy = false;
      override readonly crossOriginResourcePolicy = false;
      override readonly crossOriginOpenerPolicy = false;
      override readonly originAgentCluster = false;
      override readonly referrerPolicy = false;
      override readonly strictTransportSecurity = false;
      override readonly xContentTypeOptions = false;
      override readonly xDnsPrefetchControl = false;
      override readonly xDownloadOptions = false;
      override readonly xFrameOptions = false;
      override readonly xPermittedCrossDomainPolicies = false;
      override readonly xXssProtection = false;
      override readonly removePoweredBy = removePoweredBy;
    }
    const downstream = new Response('ok', { headers: { 'X-Powered-By': 'zelt' } });
    const middleware = new SecureHeadersMiddleware(new DisabledConfig());

    const res = await applyMiddleware(middleware, downstream);

    expect(res.headers.get('X-Powered-By')).toBe(removePoweredBy ? null : 'zelt');
    expect(res.headers.get('X-Content-Type-Options')).toBeNull();
    if (!removePoweredBy) expect(res).toBe(downstream);
    expect(await res.text()).toBe('ok');
  });

  it('adds secure headers by default', async () => {
    @Controller('/')
    class TestController {
      @Get('/test')
      test() {
        return { ok: true };
      }
    }

    const app = createApp([http({ controllers: [TestController] })]);
    const readyApp = await app.createRuntime();

    const res = await readyApp.http.fetch(new Request('http://localhost/test'));

    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(res.headers.get('X-Frame-Options')).toBe('SAMEORIGIN');

    await readyApp.shutdown();
  });

  it('can be used with @UseMiddleware', async () => {
    @Controller('/')
    @UseMiddleware(SecureHeadersMiddleware)
    class TestController {
      @Get('/test')
      test() {
        return { ok: true };
      }
    }

    const app = createApp([http({ controllers: [TestController] })]);
    const readyApp = await app.createRuntime();

    const res = await readyApp.http.fetch(new Request('http://localhost/test'));

    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');

    await readyApp.shutdown();
  });

  it('applies secure headers after downstream handlers', async () => {
    @Controller('/')
    class TestController {
      @Get('/test')
      test(res = response()) {
        return res.header('X-Frame-Options', 'DENY').json({ ok: true });
      }
    }

    const app = createApp([http({ controllers: [TestController] })]);
    const readyApp = await app.createRuntime();

    const res = await readyApp.http.fetch(new Request('http://localhost/test'));

    expect(res.headers.get('X-Frame-Options')).toBe('SAMEORIGIN');

    await readyApp.shutdown();
  });

  it('removes X-Powered-By after downstream handlers', async () => {
    @Controller('/')
    class TestController {
      @Get('/test')
      test(res = response()) {
        return res.header('X-Powered-By', 'zelt').json({ ok: true });
      }
    }

    const app = createApp([http({ controllers: [TestController] })]);
    const readyApp = await app.createRuntime();

    const res = await readyApp.http.fetch(new Request('http://localhost/test'));

    expect(res.headers.get('X-Powered-By')).toBeNull();

    await readyApp.shutdown();
  });
});
