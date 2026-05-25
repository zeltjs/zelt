import { Controller, Get, response } from '@zeltjs/core';

// Mirrors NestJS OverrideController where a base @Controller had its method @Version-overridden:
// each handler is wired to its own versioned path.
@Controller('/')
export class OverrideController {
  @Get('/v1/override')
  overrideV1() {
    return response().text('Override Version 1');
  }

  @Get('/v2/override')
  overrideV2() {
    return response().text('Override Version 2');
  }
}
