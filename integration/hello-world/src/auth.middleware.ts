import type { FunctionMiddleware } from '@zeltjs/core';
import { setUser } from '@zeltjs/core';

export const authMiddleware: FunctionMiddleware = async (c, next) => {
  const authHeader = c.req.header('Authorization');
  if (authHeader === 'Bearer valid-token') {
    setUser({ id: 1, name: 'alice' }, ['user']);
  } else if (authHeader === 'Bearer admin-token') {
    setUser({ id: 2, name: 'admin' }, ['admin', 'user']);
  }
  await next();
};
