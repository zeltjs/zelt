import { Controller, Get, inject, UseMiddleware } from '@zeltjs/core';

import { AuthMiddleware } from './auth.middleware';
import { GreetingService } from './greeting.service';
import { LoggingMiddleware } from './logging.middleware';

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
