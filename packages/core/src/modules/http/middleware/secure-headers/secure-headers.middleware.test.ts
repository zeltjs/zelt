import { describe, expect, it } from 'vitest';

import { createApp } from '../../../../app';
import { http } from '../../../../features/http.feature';
import { Controller } from '../../routing/controller.decorator';
import { Get } from '../../routing/http-method.decorator';
import { UseMiddleware } from '../use-middleware.decorator';
import { SecureHeadersMiddleware } from './secure-headers.middleware';

describe('SecureHeadersMiddleware', () => {
  it('adds secure headers by default', async () => {
    @Controller('/')
    class TestController {
      @Get('/test')
      test() {
        return { ok: true };
      }
    }

    const app = createApp([http({ controllers: [TestController] })]);
    const readyApp = await app.ready();

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
    const readyApp = await app.ready();

    const res = await readyApp.http.fetch(new Request('http://localhost/test'));

    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');

    await readyApp.shutdown();
  });
});
