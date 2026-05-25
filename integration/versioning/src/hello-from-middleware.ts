import type { FunctionMiddleware } from '@zeltjs/core';

// Equivalent of NestJS's `consumer.apply((req, res) => res.end('Hello from middleware function!'))`:
// a middleware that responds directly and never calls next().
export const helloFromMiddleware: FunctionMiddleware = async (c) => {
  return c.text('Hello from middleware function!');
};
