import { describe, it, expect } from 'vitest';
import { Container } from '@needle-di/core';
import {
  Controller,
  Get,
  UseMiddleware,
  createHttpApp,
  currentUser,
  currentRoles,
} from '@zeltjs/core';

import { JwtMiddleware } from './jwt.middleware';
import { JwtService } from './jwt.service';
import { JwtConfig } from './jwt.config';
import type { JwtPayload } from './jwt.types';

class TestJwtConfig extends JwtConfig {
  override get secret(): string {
    return 'test-secret-key-for-testing-only';
  }

  override get resolveUser() {
    return async (payload: JwtPayload) => ({
      user: payload.sub,
      roles: ['user', 'admin'] as string[],
    });
  }
}

@Controller('/protected')
@UseMiddleware(JwtMiddleware)
class ProtectedController {
  @Get('/')
  get() {
    return { message: 'success' };
  }
}

const buildApp = async () => {
  const app = createHttpApp({
    controllers: [ProtectedController],
    configs: [TestJwtConfig],
  });
  await app.ready();
  return app;
};

const buildJwtService = () => {
  const container = new Container();
  container.bind({ provide: JwtConfig.Token, useClass: TestJwtConfig });
  return container.get(JwtService);
};

describe('JwtMiddleware', () => {
  it('should return 401 when no Authorization header', async () => {
    const res = await (await buildApp()).request('/protected/');

    expect(res.status).toBe(401);
  });

  it('should return 401 when Authorization header is not Bearer', async () => {
    const res = await (await buildApp()).request('/protected/', {
      headers: { Authorization: 'Basic abc123' },
    });

    expect(res.status).toBe(401);
  });

  it('should return 401 when token is invalid', async () => {
    const res = await (await buildApp()).request('/protected/', {
      headers: { Authorization: 'Bearer invalid-token' },
    });

    expect(res.status).toBe(401);
  });

  it('should allow request with valid token', async () => {
    const jwtService = buildJwtService();
    const token = await jwtService.sign({ sub: 'user-123' });
    const res = await (await buildApp()).request('/protected/', {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { message: string };
    expect(body.message).toBe('success');
  });

  it('should return 401 for expired token', async () => {
    const expiredContainer = new Container();
    class ExpiredConfig extends JwtConfig {
      override get secret(): string {
        return 'test-secret-key-for-testing-only';
      }
      override get expiresIn(): string {
        return '0s';
      }
    }
    expiredContainer.bind({ provide: JwtConfig.Token, useClass: ExpiredConfig });
    const expiredJwtService = expiredContainer.get(JwtService);
    const token = await expiredJwtService.sign({ sub: 'user-123' });

    await new Promise((resolve) => setTimeout(resolve, 100));

    const res = await (await buildApp()).request('/protected/', {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(401);
  });
});

describe('JwtMiddleware — setUser integration', () => {
  it('should expose currentUser and currentRoles after middleware runs', async () => {
    let capturedUser: unknown;
    let capturedRoles: string[] = [];

    @Controller('/user-check')
    @UseMiddleware(JwtMiddleware)
    class UserCheckController {
      @Get('/')
      get() {
        capturedUser = currentUser();
        capturedRoles = currentRoles();
        return { ok: true };
      }
    }

    const httpApp = createHttpApp({
      controllers: [UserCheckController],
      configs: [TestJwtConfig],
    });
    await httpApp.ready();

    const jwtService = buildJwtService();
    const token = await jwtService.sign({ sub: 'user-42' });

    const res = await httpApp.request('/user-check/', {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(200);
    expect(capturedUser).toBe('user-42');
    expect(capturedRoles).toEqual(['user', 'admin']);
  });
});
