import { describe, expect, it } from 'vitest';
import { createApp } from '../../../../app';
import { http } from '../../http.feature';
import { Controller } from '../../routing/controller.decorator';
import { Get } from '../../routing/http-method.decorator';

import { cookie } from './cookie.lib';

describe('cookie', () => {
  it('returns cookie value', async () => {
    @Controller('/')
    class TestController {
      @Get('/')
      index(session = cookie('session')) {
        return { session };
      }
    }

    const app = createApp([http({ controllers: [TestController] })]);
    const readyApp = await app.ready();
    const res = await readyApp.http.fetch(
      new Request('http://localhost/', {
        headers: { Cookie: 'session=abc123' },
      }),
    );
    expect(await res.json()).toEqual({ session: 'abc123' });
  });

  it('returns undefined for missing cookie', async () => {
    @Controller('/')
    class TestController {
      @Get('/')
      index(session = cookie('session')) {
        return { session: session ?? 'none' };
      }
    }

    const app = createApp([http({ controllers: [TestController] })]);
    const readyApp = await app.ready();
    const res = await readyApp.http.fetch(new Request('http://localhost/'));
    expect(await res.json()).toEqual({ session: 'none' });
  });
});
