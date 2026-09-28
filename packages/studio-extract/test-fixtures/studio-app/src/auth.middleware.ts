import type { Next } from '@zeltjs/core';
import { Middleware } from '@zeltjs/core';

@Middleware
export class AuthMiddleware {
  async use(next: Next): Promise<Response | undefined> {
    await next();
    return undefined;
  }
}
