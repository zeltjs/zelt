import { Controller, Get, UseMiddleware } from '@zeltjs/core';

import { helloFromMiddleware } from './hello-from-middleware';

// Version-neutral middleware controller: mounted without a version prefix.
@UseMiddleware(helloFromMiddleware)
@Controller('/middleware')
export class NeutralMiddlewareController {
  @Get('/neutral')
  neutral() {
    return 'Neutral';
  }
}
