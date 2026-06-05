import { describe, expect, it } from 'vitest';
import { createApp } from '../../../../app';
import { http } from '../../http.feature';
import { Controller } from '../../routing/controller.decorator';
import { Get } from '../../routing/http-method.decorator';

import { header } from './header.lib';

describe('header', () => {
  it('returns header value', async () => {
    @Controller('/')
    class TestController {
      @Get('/')
      index(ua = header('user-agent')) {
        return { ua };
      }
    }

    const app = createApp([http({ controllers: [TestController] })]);
    const readyApp = await app.createRuntime();
    const res = await readyApp.http.fetch(
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

    const app = createApp([http({ controllers: [TestController] })]);
    const readyApp = await app.createRuntime();
    const res = await readyApp.http.fetch(new Request('http://localhost/'));
    expect(await res.json()).toEqual({ custom: 'none' });
  });
});
