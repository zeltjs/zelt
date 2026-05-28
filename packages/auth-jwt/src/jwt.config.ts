import type { RequestContextSchema } from '@zeltjs/core';
import { Config, Env, inject } from '@zeltjs/core';

import { ZeltJwtConfigError } from './jwt.errors';
import type { JwtDriver, JwtPayload } from './jwt.types';

export interface ResolveUserResult {
  user: RequestContextSchema['user'];
  roles: RequestContextSchema['authRoles'];
}

@Config
export class JwtConfig {
  constructor(private readonly env = inject(Env)) {}

  /**
   * @throws {ZeltJwtConfigError} When JWT_SECRET is not set
   */
  get secret(): string {
    const secret = this.env.getString('JWT_SECRET');
    if (!secret) {
      throw new ZeltJwtConfigError({ reason: 'missing_secret' });
    }
    return secret;
  }

  get expiresIn(): string {
    return '1h';
  }

  get driver(): JwtDriver {
    return 'header';
  }

  get cookieName(): string {
    return 'jwt';
  }

  get resolveUser(): (payload: JwtPayload) => Promise<ResolveUserResult> {
    return async (payload) => ({
      user: payload.sub,
      roles: [],
    });
  }
}
