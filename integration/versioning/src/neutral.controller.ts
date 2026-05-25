import { Controller, Get, response } from '@zeltjs/core';

// VERSION_NEUTRAL equivalent: a controller without a version prefix in the path,
// reachable regardless of the requested version.
@Controller('/')
export class VersionNeutralController {
  @Get('/neutral')
  neutral() {
    return response().text('Neutral');
  }
}
