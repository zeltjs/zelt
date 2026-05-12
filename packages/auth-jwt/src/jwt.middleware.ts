import type { Next, RequestContext } from '@zeltjs/core';
import { inject, Middleware, setUser } from '@zeltjs/core';
import { getCookie } from 'hono/cookie';

import { JwtConfig } from './jwt.config';
import { JwtService } from './jwt.service';

@Middleware
export class JwtMiddleware {
  constructor(
    private readonly jwtService = inject(JwtService),
    private readonly config = inject(JwtConfig),
  ) {}

  async use(c: RequestContext, next: Next): Promise<Response | undefined> {
    const token = this.extractToken(c);

    if (!token) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const verified = await this.jwtService.verify(token).then(
      (payload) => ({ ok: true as const, payload }),
      () => ({ ok: false as const }),
    );

    if (!verified.ok) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const { user, roles } = await this.config.resolveUser(verified.payload);
    setUser(user, roles);
    await next();
    return undefined;
  }

  private extractToken(c: RequestContext): string | null {
    if (this.config.driver === 'cookie') {
      return getCookie(c, this.config.cookieName) ?? null;
    }

    const authHeader = c.req.header('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return null;
    }
    return authHeader.slice(7);
  }
}
