import { describe, expect, it } from 'vitest';
import { Config, Controller, CorsConfig, createApp, Get } from '../../../../index';

@Controller('/test')
class TestController {
  @Get('/')
  get() {
    return { ok: true };
  }
}

describe('CorsConfig', () => {
  it('does not add CORS headers when origin is empty array (default)', async () => {
    const app = createApp({ http: { controllers: [TestController] } });
    await app.ready();

    const res = await app.request('/test', {
      headers: { Origin: 'http://example.com' },
    });

    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();

    await app.shutdown();
  });

  it('adds CORS headers when origin is configured', async () => {
    @Config
    class MyCorsConfig extends CorsConfig {
      override readonly origin = 'http://example.com';
    }

    const app = createApp({
      http: { controllers: [TestController] },
      configs: [MyCorsConfig],
    });
    await app.ready();

    const res = await app.request('/test', {
      headers: { Origin: 'http://example.com' },
    });

    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('http://example.com');

    await app.shutdown();
  });

  it('supports multiple origins', async () => {
    @Config
    class MyCorsConfig extends CorsConfig {
      override readonly origin = ['http://example.com', 'http://localhost:3000'];
    }

    const app = createApp({
      http: { controllers: [TestController] },
      configs: [MyCorsConfig],
    });
    await app.ready();

    const res = await app.request('/test', {
      headers: { Origin: 'http://localhost:3000' },
    });

    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:3000');

    await app.shutdown();
  });

  it('supports credentials option', async () => {
    @Config
    class MyCorsConfig extends CorsConfig {
      override readonly origin = 'http://example.com';
      override readonly credentials = true;
    }

    const app = createApp({
      http: { controllers: [TestController] },
      configs: [MyCorsConfig],
    });
    await app.ready();

    const res = await app.request('/test', {
      headers: { Origin: 'http://example.com' },
    });

    expect(res.headers.get('Access-Control-Allow-Credentials')).toBe('true');

    await app.shutdown();
  });
});
