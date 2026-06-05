import { describe, expect, it } from 'vitest';

import { Controller, createApp, Get, http } from '../index';

describe('HttpApp.getControllers', () => {
  it('returns the list of registered controllers from static caps', () => {
    @Controller('/a')
    class AController {
      @Get('/') get() {
        return 'a';
      }
    }

    @Controller('/b')
    class BController {
      @Get('/') get() {
        return 'b';
      }
    }

    const app = createApp([http({ controllers: [AController, BController] })]);

    expect(app.http.getControllers()).toEqual([AController, BController]);
  });
});
