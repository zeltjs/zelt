import { Controller, Get, UseMiddleware } from '@zeltjs/core';

import { helloFromMiddleware } from './hello-from-middleware';

// V1 middleware controller: mounted at /v1/middleware
@UseMiddleware(helloFromMiddleware)
@Controller('/v1/middleware')
export class MiddlewareV1Controller {
  @Get('/')
  hello() {
    return 'Hello from "MiddlewareController"!';
  }
}

// Partial override to V2: same controller exposing the override route at v2.
@UseMiddleware(helloFromMiddleware)
@Controller('/v2/middleware')
export class MiddlewareV2Controller {
  @Get('/override')
  helloV2() {
    return 'Hello from "MiddlewareController"!';
  }
}
