import { Controller, Get, UseMiddleware } from '@zeltjs/core';

import { HelloFromMiddleware } from './hello-from-middleware';

// Version-neutral middleware controller: mounted without a version prefix.
@UseMiddleware(HelloFromMiddleware)
@Controller('/middleware')
export class NeutralMiddlewareController {
  @Get('/neutral')
  neutral() {
    return 'Neutral';
  }
}
