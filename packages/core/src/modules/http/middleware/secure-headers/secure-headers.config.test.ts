import { describe, expect, it } from 'vitest';
import { Config, Controller, createApp, Get, SecureHeadersConfig } from '../../../../index';

@Controller('/test')
class TestController {
  @Get('/')
  get() {
    return { ok: true };
  }
}

describe('SecureHeadersConfig', () => {
  it('adds default security headers', async () => {
    const app = createApp({ http: { controllers: [TestController] } });
    await app.ready();

    const res = await app.request('/test');

    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(res.headers.get('X-Frame-Options')).toBe('SAMEORIGIN');
    expect(res.headers.get('Referrer-Policy')).toBe('no-referrer');

    await app.shutdown();
  });

  it('allows customizing security headers', async () => {
    @Config
    class MySecureHeadersConfig extends SecureHeadersConfig {
      override readonly xFrameOptions = 'DENY';
      override readonly referrerPolicy = 'strict-origin-when-cross-origin';
    }

    const app = createApp({
      http: { controllers: [TestController] },
      configs: [MySecureHeadersConfig],
    });
    await app.ready();

    const res = await app.request('/test');

    expect(res.headers.get('X-Frame-Options')).toBe('DENY');
    expect(res.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');

    await app.shutdown();
  });

  it('allows disabling specific headers', async () => {
    @Config
    class MySecureHeadersConfig extends SecureHeadersConfig {
      override readonly xXssProtection = false;
    }

    const app = createApp({
      http: { controllers: [TestController] },
      configs: [MySecureHeadersConfig],
    });
    await app.ready();

    const res = await app.request('/test');

    expect(res.headers.get('X-XSS-Protection')).toBeNull();

    await app.shutdown();
  });
});
