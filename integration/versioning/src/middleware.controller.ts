import { Controller, Get, UseMiddleware } from '@zeltjs/core';

import { HelloFromMiddleware } from './hello-from-middleware';

// V1 middleware controller: mounted at /v1/middleware
@UseMiddleware(HelloFromMiddleware)
@Controller('/v1/middleware')
export class MiddlewareV1Controller {
  @Get('/')
  hello() {
    return 'Hello from "MiddlewareController"!';
  }
}

// Partial override to V2: same controller exposing the override route at v2.
@UseMiddleware(HelloFromMiddleware)
@Controller('/v2/middleware')
export class MiddlewareV2Controller {
  @Get('/override')
  helloV2() {
    return 'Hello from "MiddlewareController"!';
  }
}
