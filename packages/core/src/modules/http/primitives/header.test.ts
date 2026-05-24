import { describe, expect, it } from 'vitest';
import { createApp } from '../../../app';
import { Controller } from '../decorators/controller';
import { Get } from '../decorators/http-method';

import { header } from './header';

describe('header', () => {
  it('returns header value', async () => {
    @Controller('/')
    class TestController {
      @Get('/')
      index(ua = header('user-agent')) {
        return { ua };
      }
    }

    const app = createApp({ http: { controllers: [TestController] } });
    await app.ready();
    const res = await app.fetch(
      new Request('http://localhost/', {
        headers: { 'User-Agent': 'test-agent' },
      }),
    );
    expect(await res.json()).toEqual({ ua: 'test-agent' });
  });

  it('returns undefined for missing header', async () => {
    @Controller('/')
    class TestController {
      @Get('/')
      index(custom = header('x-custom')) {
        return { custom: custom ?? 'none' };
      }
    }

    const app = createApp({ http: { controllers: [TestController] } });
    await app.ready();
    const res = await app.fetch(new Request('http://localhost/'));
    expect(await res.json()).toEqual({ custom: 'none' });
  });
});
