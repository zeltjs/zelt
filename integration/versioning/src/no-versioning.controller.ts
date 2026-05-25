import { Controller, Get, response } from '@zeltjs/core';

@Controller('/foo')
export class NoVersioningController {
  @Get('/bar')
  helloFoo() {
    return response().text('Hello FooBar!');
  }
}
