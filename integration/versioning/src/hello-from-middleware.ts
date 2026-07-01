import { Middleware } from '@zeltjs/core';

// Equivalent of NestJS's `consumer.apply((req, res) => res.end('Hello from middleware function!'))`:
// a middleware that responds directly and never calls next().
@Middleware
export class HelloFromMiddleware {
  use(): Response {
    return new Response('Hello from middleware function!');
  }
}
