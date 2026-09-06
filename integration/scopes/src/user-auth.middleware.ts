import type { Next } from '@zeltjs/core';
import { Middleware, MiddlewareWithOptions, optionsOf } from '@zeltjs/core';

export type RoleAuthOptions = {
  role: string;
};

export type AuthenticatedUser = {
  id: string;
  role: string;
};

// Mirrors the doc's "Middleware with Options" example: a middleware that
// needs configuration extends MiddlewareWithOptions<TOptions> and reads it
// via optionsOf() as a use() parameter default. It hands its result
// downstream via next(value) so resultOf() at the applied binding's exact
// identity can read it back.
@Middleware
export class UserAuthMiddleware extends MiddlewareWithOptions<RoleAuthOptions> {
  async use(
    next: Next<AuthenticatedUser>,
    opts = optionsOf(UserAuthMiddleware),
  ): Promise<Response | undefined> {
    await next({ id: `user-${opts.role}`, role: opts.role });
    return undefined;
  }
}

// Two distinct bindings of the same class. Each .with() call is its own
// middleware identity — sharing these consts (not re-calling .with()) is
// what lets @UseMiddleware and resultOf()/optionsOf() agree on which
// binding they mean.
export const adminAuth = UserAuthMiddleware.with({ role: 'admin' });
export const memberAuth = UserAuthMiddleware.with({ role: 'member' });
