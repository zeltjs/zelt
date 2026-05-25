import { describe, expect, it } from 'vitest';

import { createApp } from '../../../../app/create-app';
import { Controller } from '../../routing/controller';
import { Get } from '../../routing/http-method';
import { UseMiddleware } from '../use-middleware';
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

    const app = createApp({
      http: { controllers: [TestController] },
      configs: [CustomCorsConfig],
    });
    await app.ready();

    const res = await app.fetch(
      new Request('http://localhost/test', {
        headers: { Origin: 'https://example.com' },
      }),
    );

    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://example.com');
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

    const app = createApp({
      http: { controllers: [TestController] },
      configs: [CustomCorsConfig],
    });
    await app.ready();

    const res = await app.fetch(
      new Request('http://localhost/test', {
        headers: { Origin: 'https://example.com' },
      }),
    );

    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://example.com');
  });
});
