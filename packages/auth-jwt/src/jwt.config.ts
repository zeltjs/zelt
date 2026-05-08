import { Config } from '@zeltjs/core';
import type { RequestContextSchema } from '@zeltjs/core';

import type { JwtPayload } from './jwt.types';

export interface ResolveUserResult {
  user: RequestContextSchema['user'];
  roles: RequestContextSchema['authRoles'];
}

@Config
export class JwtConfig {
  get secret(): string {
    const secret = process.env['JWT_SECRET'];
    if (!secret) {
      throw new Error('JWT_SECRET environment variable is required');
    }
    return secret;
  }

  get expiresIn(): string {
    return '1h';
  }

  get resolveUser(): (payload: JwtPayload) => Promise<ResolveUserResult> {
    return async (payload) => ({
      user: payload.sub,
      roles: [],
    });
  }
}
