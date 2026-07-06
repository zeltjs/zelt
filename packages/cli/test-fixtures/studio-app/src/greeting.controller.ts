import { Controller, Get, inject } from '@zeltjs/core';

import { GreetingService } from './greeting.service';

@Controller('/greeting')
export class GreetingController {
  constructor(private greeting = inject(GreetingService)) {}

  @Get('/')
  greet(): { message: string } {
    return { message: this.greeting.greet() };
  }
}
