import { Injectable, inject } from '@zeltjs/core';

import { ClockService } from './clock.service';

@Injectable()
export class GreetingService {
  constructor(private clock = inject(ClockService)) {}

  greet(): string {
    return `hello at ${this.clock.now()}`;
  }
}
