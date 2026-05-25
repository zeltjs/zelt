import { Controller, Get, response } from '@zeltjs/core';

const MULTIPLE_BODY = 'Multiple Versions 1 or 2';

@Controller('/v1')
export class MultipleVersionV1Controller {
  @Get('/multiple')
  multiple() {
    return response().text(MULTIPLE_BODY);
  }
}

@Controller('/v2')
export class MultipleVersionV2Controller {
  @Get('/multiple')
  multiple() {
    return response().text(MULTIPLE_BODY);
  }
}
