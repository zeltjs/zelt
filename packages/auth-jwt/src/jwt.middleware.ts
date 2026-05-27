import type { Next } from '@zeltjs/core';
import { cookie, header, inject, Middleware, setUser } from '@zeltjs/core';

import { UnauthorizedException } from './exceptions';
import { JwtConfig } from './jwt.config';
import { JwtService } from './jwt.service';

@Middleware
export class JwtMiddleware {
  constructor(
    private readonly jwtService = inject(JwtService),
    private readonly config = inject(JwtConfig),
  ) {}

  /**
   * @throws {UnauthorizedException} When token is missing (401)
   * @throws {UnauthorizedException} When token is invalid or expired (401)
   * @throws {ZeltContextNotAvailableError}
   */
  async use(next: Next): Promise<Response | undefined> {
    const token = this.extractToken();

    if (!token) {
      throw new UnauthorizedException({ reason: 'missing_token' });
    }

    const verified = await this.jwtService.verify(token).then(
      (payload) => ({ ok: true as const, payload }),
      () => ({ ok: false as const }),
    );

    if (!verified.ok) {
      throw new UnauthorizedException({ reason: 'invalid_token' });
    }

    const { user, roles } = await this.config.resolveUser(verified.payload);
    setUser(user, roles);
    await next();
    return undefined;
  }

  /** @throws {ZeltContextNotAvailableError} */
  private extractToken(): string | null {
    if (this.config.driver === 'cookie') {
      return cookie(this.config.cookieName) ?? null;
    }

    const authHeader = header('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return null;
    }
    return authHeader.slice(7);
  }
}
