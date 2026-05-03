import { Controller, Get, inject, pathParam } from '@koya/core';

import { HelloService } from './hello.service';

@Controller('/hello')
export class HelloController {
  // constructor injection。@Controller が @Injectable を兼ねるので、
  // controllers にだけ列挙すれば、依存する Provider は auto-bind で解決される (spec §4.10)。
  constructor(private helloService = inject(HelloService)) {}

  @Get('/:name')
  greet(name = pathParam('name')) {
    return { message: this.helloService.greet(name) };
  }
}
