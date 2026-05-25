import { Controller, Get, inject } from '@zeltjs/core';

import { CounterService } from './counter.service';

@Controller('/counter-b')
export class CounterBController {
  constructor(private counter = inject(CounterService)) {}

  @Get('/inc')
  inc() {
    return { value: this.counter.increment() };
  }

  @Get('/value')
  current() {
    return { value: this.counter.value() };
  }
}
