import { Controller, Get, pathParam, response } from '@zeltjs/core';

@Controller('/v2')
export class AppV2Controller {
  @Get('/')
  helloWorldV2() {
    return response().text('Hello World V2!');
  }

  @Get('/:param/hello')
  paramV2(_param = pathParam('param')) {
    return response().text('Parameter V2!');
  }
}
