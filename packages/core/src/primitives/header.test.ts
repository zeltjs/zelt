import { describe, expect, it } from 'vitest';

import { Controller } from '../decorators/controller';
import { Get } from '../decorators/http-method';
import { createHttpApp } from '../http/app';

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

    const app = createHttpApp({ controllers: [TestController] });
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

    const app = createHttpApp({ controllers: [TestController] });
    await app.ready();
    const res = await app.fetch(new Request('http://localhost/'));
    expect(await res.json()).toEqual({ custom: 'none' });
  });
});
