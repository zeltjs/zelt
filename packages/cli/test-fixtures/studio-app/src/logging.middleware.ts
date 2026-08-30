import type { Next } from '@zeltjs/core';
import { inject, Middleware } from '@zeltjs/core';

import { ClockService } from './clock.service';

@Middleware
export class LoggingMiddleware {
  constructor(private clock = inject(ClockService)) {}

  async use(next: Next): Promise<Response | undefined> {
    console.log(this.clock.now());
    await next();
    return undefined;
  }
}
