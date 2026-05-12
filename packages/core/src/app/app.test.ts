import { describe, expect, it } from 'vitest';

import { Controller, createApp, Get } from '../index';

describe('HttpApp.getControllers', () => {
  it('returns the list of registered controllers', () => {
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

    const app = createApp({ http: { controllers: [AController, BController] } });

    expect(app.getControllers()).toEqual([AController, BController]);
  });
});
