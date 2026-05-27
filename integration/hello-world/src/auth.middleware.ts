import type { Next } from '@zeltjs/core';
import { header, Middleware, setUser } from '@zeltjs/core';

@Middleware
export class AuthMiddleware {
  async use(next: Next): Promise<Response | undefined> {
    const authHeader = header('Authorization');
    if (authHeader === 'Bearer valid-token') {
      setUser({ id: 1, name: 'alice' }, ['user']);
    } else if (authHeader === 'Bearer admin-token') {
      setUser({ id: 2, name: 'admin' }, ['admin', 'user']);
    }
    await next();
    return undefined;
  }
}
