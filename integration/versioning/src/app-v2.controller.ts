import { Controller, Get, request, response } from '@zeltjs/core';

@Controller('/v2')
export class AppV2Controller {
  @Get('/')
  helloWorldV2() {
    return response().text('Hello World V2!');
  }

  @Get('/:param/hello')
  paramV2(req = request()) {
    const param = req.pathParam('param');
    return response().text(`Parameter V2: ${param}`);
  }
}
