import { describe, expect, it } from 'vitest';
import { Config, Controller, CorsConfig, createApp, Get, http, response } from '../../../../index';

@Controller('/test')
class TestController {
  @Get('/')
  get() {
    return { ok: true };
  }

  @Get('/raw')
  raw() {
    return response().text('ok');
  }
}

describe('CorsConfig', () => {
  it('does not add CORS headers when origin is empty array (default)', async () => {
    const app = createApp([http({ controllers: [TestController] })]);
    const readyApp = await app.createRuntime();

    const res = await readyApp.http.request('/test', {
      headers: { Origin: 'http://example.com' },
    });

    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
    expect(res.headers.get('Access-Control-Allow-Methods')).toBeNull();

    await readyApp.shutdown();
  });

  it('does not handle CORS preflight when origin is empty array (default)', async () => {
    const app = createApp([http({ controllers: [TestController] })]);
    const readyApp = await app.createRuntime();

    const res = await readyApp.http.request('/test', {
      method: 'OPTIONS',
      headers: {
        Origin: 'http://example.com',
        'Access-Control-Request-Method': 'POST',
      },
    });

    expect(res.status).toBe(404);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
    expect(res.headers.get('Access-Control-Allow-Methods')).toBeNull();

    await readyApp.shutdown();
  });

  it('adds CORS headers when origin is configured', async () => {
    @Config
    class MyCorsConfig extends CorsConfig {
      override readonly origin = 'http://example.com';
    }

    const app = createApp([http({ controllers: [TestController] })], { configs: [MyCorsConfig] });
    const readyApp = await app.createRuntime();

    const res = await readyApp.http.request('/test', {
      headers: { Origin: 'http://example.com' },
    });

    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('http://example.com');

    await readyApp.shutdown();
  });

  it('adds CORS headers to reply data results', async () => {
    @Config
    class MyCorsConfig extends CorsConfig {
      override readonly origin = 'http://example.com';
    }

    const app = createApp([http({ controllers: [TestController] })], { configs: [MyCorsConfig] });
    const readyApp = await app.createRuntime();

    const res = await readyApp.http.request('/test/raw', {
      headers: { Origin: 'http://example.com' },
    });

    expect(await res.text()).toBe('ok');
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('http://example.com');

    await readyApp.shutdown();
  });

  it('returns 204 for CORS preflight without requiring an OPTIONS route', async () => {
    @Config
    class MyCorsConfig extends CorsConfig {
      override readonly origin = 'http://example.com';
    }

    const app = createApp([http({ controllers: [TestController] })], { configs: [MyCorsConfig] });
    const readyApp = await app.createRuntime();

    const res = await readyApp.http.request('/test', {
      method: 'OPTIONS',
      headers: {
        Origin: 'http://example.com',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'content-type, authorization',
      },
    });

    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('http://example.com');
    expect(res.headers.get('Access-Control-Allow-Headers')).toBe('content-type,authorization');
    expect(res.headers.get('Vary')).toContain('Access-Control-Request-Headers');

    await readyApp.shutdown();
  });

  it('supports multiple origins', async () => {
    @Config
    class MyCorsConfig extends CorsConfig {
      override readonly origin = ['http://example.com', 'http://localhost:3000'];
    }

    const app = createApp([http({ controllers: [TestController] })], { configs: [MyCorsConfig] });
    const readyApp = await app.createRuntime();

    const res = await readyApp.http.request('/test', {
      headers: { Origin: 'http://localhost:3000' },
    });

    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:3000');
    expect(res.headers.get('Vary')).toContain('Origin');

    await readyApp.shutdown();
  });

  it('sets Vary Origin when configured origins reject the request origin', async () => {
    @Config
    class MyCorsConfig extends CorsConfig {
      override readonly origin = ['http://example.com', 'http://localhost:3000'];
    }

    const app = createApp([http({ controllers: [TestController] })], { configs: [MyCorsConfig] });
    const readyApp = await app.createRuntime();

    const res = await readyApp.http.request('/test', {
      headers: { Origin: 'http://evil.example' },
    });

    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
    expect(res.headers.get('Vary')).toContain('Origin');

    await readyApp.shutdown();
  });

  it('supports credentials option', async () => {
    @Config
    class MyCorsConfig extends CorsConfig {
      override readonly origin = 'http://example.com';
      override readonly credentials = true;
    }

    const app = createApp([http({ controllers: [TestController] })], { configs: [MyCorsConfig] });
    const readyApp = await app.createRuntime();

    const res = await readyApp.http.request('/test', {
      headers: { Origin: 'http://example.com' },
    });

    expect(res.headers.get('Access-Control-Allow-Credentials')).toBe('true');

    await readyApp.shutdown();
  });

  it.each(['GET', 'OPTIONS'])(
    'uses an explicit credentialed origin allowlist for %s',
    async (method) => {
      @Config
      class MyCorsConfig extends CorsConfig {
        override readonly origin = ['http://example.com', 'http://localhost:3000'];
        override readonly credentials = true;
      }

      const app = createApp([http({ controllers: [TestController] })], { configs: [MyCorsConfig] });
      const readyApp = await app.createRuntime();
      try {
        for (const { origin, allowedOrigin } of [
          { origin: 'http://example.com', allowedOrigin: 'http://example.com' },
          { origin: 'http://localhost:3000', allowedOrigin: 'http://localhost:3000' },
          { origin: 'http://evil.example', allowedOrigin: null },
          { origin: 'null', allowedOrigin: null },
        ]) {
          const res = await readyApp.http.request('/test', { method, headers: { Origin: origin } });
          expect(res.headers.get('Access-Control-Allow-Origin')).toBe(allowedOrigin);
          expect(res.headers.get('Access-Control-Allow-Credentials')).toBe('true');
        }
      } finally {
        await readyApp.shutdown();
      }
    },
  );

  it.each([
    ['GET', 'http://example.com'],
    ['OPTIONS', 'http://example.com'],
    ['GET', 'null'],
    ['OPTIONS', 'null'],
  ])('does not reflect %s request origin %s for wildcard credentials', async (method, origin) => {
    @Config
    class MyCorsConfig extends CorsConfig {
      override readonly origin = '*';
      override readonly credentials = true;
    }

    const app = createApp([http({ controllers: [TestController] })], { configs: [MyCorsConfig] });
    const readyApp = await app.createRuntime();

    const res = await readyApp.http.request('/test', {
      method,
      headers: { Origin: origin },
    });

    // Browsers reject wildcard origins with credentials; reflecting the origin would allow them.
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(res.headers.get('Access-Control-Allow-Credentials')).toBe('true');

    await readyApp.shutdown();
  });
});
