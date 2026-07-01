import { Controller, Get, UseMiddleware } from '@zeltjs/core';

import { HelloFromMiddleware } from './hello-from-middleware';

@UseMiddleware(HelloFromMiddleware)
@Controller('/v1/middleware')
export class MultipleMiddlewareV1Controller {
  @Get('/multiple')
  multiple() {
    return 'Multiple Versions 1 or 2';
  }
}

@UseMiddleware(HelloFromMiddleware)
@Controller('/v2/middleware')
export class MultipleMiddlewareV2Controller {
  @Get('/multiple')
  multiple() {
    return 'Multiple Versions 1 or 2';
  }
}
