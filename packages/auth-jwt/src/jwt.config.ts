import type { RequestContextSchema } from '@zeltjs/core';
import { Config } from '@zeltjs/core';

import { ZeltJwtConfigError } from './errors';
import type { JwtDriver, JwtPayload } from './jwt.types';

export interface ResolveUserResult {
  user: RequestContextSchema['user'];
  roles: RequestContextSchema['authRoles'];
}

@Config
export class JwtConfig {
  /**
   * @throws {ZeltJwtConfigError} When JWT_SECRET is not set
   */
  get secret(): string {
    const secret = process.env['JWT_SECRET'];
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
