import type { Next } from '@zeltjs/core';
import { Middleware, request } from '@zeltjs/core';

const sanitizeLogValue = (value: string): string =>
  Array.from(value, (char) => {
    const code = char.charCodeAt(0);
    return code < 32 || code === 127 ? '?' : char;
  }).join('');

@Middleware
export class LoggingMiddleware {
  async use(next: Next, req = request()): Promise<Response | undefined> {
    const start = Date.now();
    await next();
    const duration = Date.now() - start;
    console.log(
      `[${sanitizeLogValue(req.method())}] ${sanitizeLogValue(req.path())} ${duration}ms`,
    );
    return undefined;
  }
}
