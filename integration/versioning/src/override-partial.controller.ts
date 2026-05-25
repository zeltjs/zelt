import { Controller, Get, response } from '@zeltjs/core';

// Mirrors NestJS OverridePartialController: controller defaults to v1 but one method overrides to v2.
@Controller('/')
export class OverridePartialController {
  @Get('/v1/override-partial')
  overridePartialV1() {
    return response().text('Override Partial Version 1');
  }

  @Get('/v2/override-partial')
  overridePartialV2() {
    return response().text('Override Partial Version 2');
  }
}
