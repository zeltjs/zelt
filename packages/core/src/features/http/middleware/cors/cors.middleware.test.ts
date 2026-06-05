import { describe, expect, it } from 'vitest';

import { createApp } from '../../../../app';
import { http } from '../../http.feature';
import { Controller } from '../../routing/controller.decorator';
import { Get } from '../../routing/http-method.decorator';
import { UseMiddleware } from '../use-middleware.decorator';
import { CorsConfig } from './cors.config';
import { CorsMiddleware } from './cors.middleware';

class CustomCorsConfig extends CorsConfig {
  override readonly origin = 'https://example.com';
}

describe('CorsMiddleware', () => {
  it('adds CORS headers when origin is configured', async () => {
    @Controller('/')
    class TestController {
      @Get('/test')
      test() {
        return { ok: true };
      }
    }

    const app = createApp([http({ controllers: [TestController] })], {
      configs: [CustomCorsConfig],
    });
    const readyApp = await app.createRuntime();

    const res = await readyApp.http.fetch(
      new Request('http://localhost/test', {
        headers: { Origin: 'https://example.com' },
      }),
    );

    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://example.com');

    await readyApp.shutdown();
  });

  it('can be used with @UseMiddleware', async () => {
    @Controller('/')
    @UseMiddleware(CorsMiddleware)
    class TestController {
      @Get('/test')
      test() {
        return { ok: true };
      }
    }

    const app = createApp([http({ controllers: [TestController] })], {
      configs: [CustomCorsConfig],
    });
    const readyApp = await app.createRuntime();

    const res = await readyApp.http.fetch(
      new Request('http://localhost/test', {
        headers: { Origin: 'https://example.com' },
      }),
    );

    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://example.com');

    await readyApp.shutdown();
  });
});
