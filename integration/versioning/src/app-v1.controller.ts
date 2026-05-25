import { Controller, Get, pathParam, response } from '@zeltjs/core';

@Controller('/v1')
export class AppV1Controller {
  @Get('/')
  helloWorldV1() {
    return response().text('Hello World V1!');
  }

  @Get('/:param/hello')
  paramV1(param = pathParam('param')) {
    return response().text(`Parameter V1: ${param}`);
  }
}
