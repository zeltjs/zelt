import { Controller, Get, inject, UseMiddleware } from '@zeltjs/core';

import { AuthMiddleware } from './auth.middleware';
import { LoggingMiddleware } from './logging.middleware';
import { GreetingService } from './services';

@Controller('/greeting')
@UseMiddleware(LoggingMiddleware)
export class GreetingController {
  constructor(private greeting = inject(GreetingService)) {}

  @Get('/')
  @UseMiddleware(AuthMiddleware)
  greet(): { message: string } {
    return { message: this.greeting.greet() };
  }
}
