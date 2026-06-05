import { describe, expect, it } from 'vitest';
import { Config, Controller, createApp, Get, http, SecureHeadersConfig } from '../../../../index';

@Controller('/test')
class TestController {
  @Get('/')
  get() {
    return { ok: true };
  }
}

describe('SecureHeadersConfig', () => {
  it('adds default security headers', async () => {
    const app = createApp([http({ controllers: [TestController] })]);
    const readyApp = await app.createRuntime();

    const res = await readyApp.http.request('/test');

    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(res.headers.get('X-Frame-Options')).toBe('SAMEORIGIN');
    expect(res.headers.get('Referrer-Policy')).toBe('no-referrer');

    await readyApp.shutdown();
  });

  it('allows customizing security headers', async () => {
    @Config
    class MySecureHeadersConfig extends SecureHeadersConfig {
      override readonly xFrameOptions = 'DENY';
      override readonly referrerPolicy = 'strict-origin-when-cross-origin';
    }

    const app = createApp([http({ controllers: [TestController] })], {
      configs: [MySecureHeadersConfig],
    });
    const readyApp = await app.createRuntime();

    const res = await readyApp.http.request('/test');

    expect(res.headers.get('X-Frame-Options')).toBe('DENY');
    expect(res.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');

    await readyApp.shutdown();
  });

  it('allows disabling specific headers', async () => {
    @Config
    class MySecureHeadersConfig extends SecureHeadersConfig {
      override readonly xXssProtection = false;
    }

    const app = createApp([http({ controllers: [TestController] })], {
      configs: [MySecureHeadersConfig],
    });
    const readyApp = await app.createRuntime();

    const res = await readyApp.http.request('/test');

    expect(res.headers.get('X-XSS-Protection')).toBeNull();

    await readyApp.shutdown();
  });
});
