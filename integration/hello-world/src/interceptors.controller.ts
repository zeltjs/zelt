import { Controller, Get, inject, UseMiddleware } from '@zeltjs/core';

import { HelloService } from './hello.service';
import {
  HeaderMiddleware,
  OverrideMiddleware,
  StatusMiddleware,
  TransformMiddleware,
} from './interceptor.middleware';

@Controller('/interceptors')
export class InterceptorsController {
  constructor(private helloService = inject(HelloService)) {}

  @UseMiddleware(OverrideMiddleware)
  @Get('/override')
  override() {
    return { message: this.helloService.greeting() };
  }

  @UseMiddleware(TransformMiddleware)
  @Get('/transform')
  transform() {
    return this.helloService.greeting();
  }

  @UseMiddleware(TransformMiddleware)
  @Get('/transform/async')
  async transformAsync() {
    return this.helloService.greeting();
  }

  @UseMiddleware(TransformMiddleware)
  @Get('/transform/stream')
  transformStream() {
    return this.helloService.greeting();
  }

  @UseMiddleware(StatusMiddleware, { statusCode: 400 })
  @Get('/status')
  status() {
    return this.helloService.greeting();
  }

  @UseMiddleware(HeaderMiddleware, { headerName: 'Authorization', headerValue: 'jwt' })
  @Get('/header')
  header() {
    return { message: this.helloService.greeting() };
  }
}
