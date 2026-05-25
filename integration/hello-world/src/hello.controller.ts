import { Controller, Get, inject, pathParam, response } from '@zeltjs/core';

import { HelloService } from './hello.service';

@Controller('/hello')
export class HelloController {
  constructor(private helloService = inject(HelloService)) {}

  @Get('/')
  index() {
    return response()
      .header('Authorization', 'Bearer')
      .json({ message: this.helloService.greeting() });
  }

  @Get('/async')
  async asyncGreeting() {
    return response()
      .header('Authorization', 'Bearer')
      .json({ message: this.helloService.greeting() });
  }

  @Get('/stream')
  streamGreeting() {
    return response()
      .header('Authorization', 'Bearer')
      .json({ message: this.helloService.greeting() });
  }

  @Get('/:name')
  greet(name = pathParam('name')) {
    return response()
      .header('Authorization', 'Bearer')
      .json({ message: this.helloService.greet(name) });
  }
}
