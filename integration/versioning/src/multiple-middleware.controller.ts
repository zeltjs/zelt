import { Controller, Get, UseMiddleware } from '@zeltjs/core';

import { helloFromMiddleware } from './hello-from-middleware';

@UseMiddleware(helloFromMiddleware)
@Controller('/v1/middleware')
export class MultipleMiddlewareV1Controller {
  @Get('/multiple')
  multiple() {
    return 'Multiple Versions 1 or 2';
  }
}

@UseMiddleware(helloFromMiddleware)
@Controller('/v2/middleware')
export class MultipleMiddlewareV2Controller {
  @Get('/multiple')
  multiple() {
    return 'Multiple Versions 1 or 2';
  }
}
