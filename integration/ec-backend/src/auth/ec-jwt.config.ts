import type { JwtPayload, ResolveUserResult } from '@zeltjs/auth-jwt';
import { JwtConfig } from '@zeltjs/auth-jwt';
import { Config } from '@zeltjs/core';

import type { EcUser } from './current-user.lib';

@Config
export class EcJwtConfig extends JwtConfig {
  override get secret(): string {
    return 'ec-backend-test-secret-key-do-not-use-in-production';
  }

  override get expiresIn(): string {
    return '24h';
  }

  override get resolveUser(): (payload: JwtPayload) => Promise<ResolveUserResult> {
    return async (payload) => {
      const user: EcUser = {
        id: payload.sub ? parseInt(payload.sub, 10) : 0,
        email: (payload.email as string) ?? '',
      };
      return {
        user,
        roles: (payload.roles as readonly string[]) ?? [],
      };
    };
  }
}
