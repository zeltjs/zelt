import { Controller, Get, response } from '@zeltjs/core';

const DEFAULT_VERSION_TEXT = 'Default Version (v1)';

// Mirrors NestJS `defaultVersion: '1'`: requests without an explicit version
// prefix are served by the same handler as the v1 route.
@Controller('/')
export class DefaultVersionController {
  @Get('/default-version')
  defaultVersion() {
    return response().text(DEFAULT_VERSION_TEXT);
  }

  @Get('/v1/default-version')
  defaultVersionV1() {
    return response().text(DEFAULT_VERSION_TEXT);
  }
}
