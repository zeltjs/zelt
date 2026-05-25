import { Controller, Get, inject } from '@zeltjs/core';

import { CounterService } from './counter.service';

@Controller('/counter-a')
export class CounterAController {
  constructor(private counter = inject(CounterService)) {}

  @Get('/inc')
  inc() {
    return { value: this.counter.increment() };
  }
}
