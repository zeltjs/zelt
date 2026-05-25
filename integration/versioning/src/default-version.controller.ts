import { Controller, Get, response } from '@zeltjs/core';

// Mirrors NestJS `defaultVersion: '1'`: requests without an explicit version
// prefix are served by the same handler as the v1 route.
@Controller('/')
export class DefaultVersionController {
  @Get('/default-version')
  defaultVersion() {
    return response().text('Default Version (v1)');
  }

  @Get('/v1/default-version')
  defaultVersionV1() {
    return response().text('Default Version (v1)');
  }
}
