import { Controller, Get, pathParam } from '@zeltjs/core';

@Controller('/hello')
export class HelloController {
  @Get('/')
  index() {
    return { message: 'Hello, World!' };
  }

  @Get('/:name')
  greet(name = pathParam('name')) {
    return { message: `Hello, ${name}!` };
  }
}
