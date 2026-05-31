import { Controller, createApp, currentRoles, currentUser, Get, http, UseMiddleware } from '@zeltjs/core';
import { createTestTarget } from '@zeltjs/testing';
import { describe, expect, it } from 'vitest';
import { JwtConfig } from './jwt.config';
import { JwtMiddleware } from './jwt.middleware';
import { JwtService } from './jwt.service';
import type { JwtPayload } from './jwt.types';

class TestJwtConfig extends JwtConfig {
  override get secret(): string {
    return 'test-secret-key-for-testing-only';
  }

  override get resolveUser() {
    return async (payload: JwtPayload) => ({
      user: { sub: payload.sub },
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
  const app = createApp([http({ controllers: [ProtectedController] })], {
    configs: [TestJwtConfig],
  });
  const readyApp = await app.ready();
  return readyApp;
};

class JwtServiceTestConfig extends JwtConfig {
  override get secret(): string {
    return 'test-secret-key-for-testing-only';
  }
}

const buildJwtService = async () => {
  const testTarget = await createTestTarget(JwtService, {
    configs: [JwtServiceTestConfig],
  });
  return { jwtService: testTarget.target, shutdown: testTarget.shutdown };
};

describe('JwtMiddleware', () => {
  it('should return 401 when no Authorization header', async () => {
    const app = await buildApp();
    const res = await app.http.request('/protected/');

    expect(res.status).toBe(401);
  });

  it('should return 401 when Authorization header is not Bearer', async () => {
    const app = await buildApp();
    const res = await app.http.request('/protected/', {
      headers: { Authorization: 'Basic abc123' },
    });

    expect(res.status).toBe(401);
  });

  it('should return 401 when token is invalid', async () => {
    const app = await buildApp();
    const res = await app.http.request('/protected/', {
      headers: { Authorization: 'Bearer invalid-token' },
    });

    expect(res.status).toBe(401);
  });

  it('should allow request with valid token', async () => {
    const { jwtService, shutdown } = await buildJwtService();
    const token = await jwtService.sign({ sub: 'user-123' });
    const app = await buildApp();
    const res = await app.http.request('/protected/', {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { message: string };
    expect(body.message).toBe('success');
    await shutdown();
  });

  it('should return 401 for expired token', async () => {
    class ExpiredConfig extends JwtConfig {
      override get secret(): string {
        return 'test-secret-key-for-testing-only';
      }
      override get expiresIn(): string {
        return '0s';
      }
    }
    const expiredTarget = await createTestTarget(JwtService, {
      configs: [ExpiredConfig],
    });
    const token = await expiredTarget.target.sign({ sub: 'user-123' });

    await new Promise((resolve) => setTimeout(resolve, 100));

    const app = await buildApp();
    const res = await app.http.request('/protected/', {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(401);
    await expiredTarget.shutdown();
  });
});

describe('JwtMiddleware — setUser integration', () => {
  it('should expose currentUser and currentRoles after middleware runs', async () => {
    let capturedUser: unknown;
    let capturedRoles: readonly string[] = [];

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

    const httpApp = createApp([http({ controllers: [UserCheckController] })], {
      configs: [TestJwtConfig],
    });
    const readyApp = await httpApp.ready();

    const { jwtService, shutdown } = await buildJwtService();
    const token = await jwtService.sign({ sub: 'user-42' });

    const res = await readyApp.http.request('/user-check/', {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(200);
    expect(capturedUser).toEqual({ sub: 'user-42' });
    expect(capturedRoles).toEqual(['user', 'admin']);
    await shutdown();
  });
});

describe('JwtMiddleware — cookie driver', () => {
  class CookieDriverConfig extends JwtConfig {
    override get secret(): string {
      return 'test-secret-key-for-testing-only';
    }

    override get driver() {
      return 'cookie' as const;
    }

    override get cookieName(): string {
      return 'auth_token';
    }

    override get resolveUser() {
      return async (payload: JwtPayload) => ({
        user: { sub: payload.sub },
        roles: ['user'] as string[],
      });
    }
  }

  const buildCookieApp = async () => {
    @Controller('/cookie-protected')
    @UseMiddleware(JwtMiddleware)
    class CookieProtectedController {
      @Get('/')
      get() {
        return { message: 'cookie-success' };
      }
    }

    const app = createApp([http({ controllers: [CookieProtectedController] })], {
      configs: [CookieDriverConfig],
    });
    const readyApp = await app.ready();
    return readyApp;
  };

  const buildCookieJwtService = async () => {
    const testTarget = await createTestTarget(JwtService, {
      configs: [CookieDriverConfig],
    });
    return { jwtService: testTarget.target, shutdown: testTarget.shutdown };
  };

  it('should return 401 when no cookie is present', async () => {
    const app = await buildCookieApp();
    const res = await app.http.request('/cookie-protected/');

    expect(res.status).toBe(401);
  });

  it('should return 401 when Authorization header is used instead of cookie', async () => {
    const { jwtService, shutdown } = await buildCookieJwtService();
    const token = await jwtService.sign({ sub: 'user-123' });
    const app = await buildCookieApp();
    const res = await app.http.request('/cookie-protected/', {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(401);
    await shutdown();
  });

  it('should allow request with valid cookie', async () => {
    const { jwtService, shutdown } = await buildCookieJwtService();
    const token = await jwtService.sign({ sub: 'user-123' });
    const app = await buildCookieApp();
    const res = await app.http.request('/cookie-protected/', {
      headers: { Cookie: `auth_token=${token}` },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { message: string };
    expect(body.message).toBe('cookie-success');
    await shutdown();
  });

  it('should return 401 for invalid cookie token', async () => {
    const app = await buildCookieApp();
    const res = await app.http.request('/cookie-protected/', {
      headers: { Cookie: 'auth_token=invalid-token' },
    });

    expect(res.status).toBe(401);
  });

  it('should expose currentUser when using cookie driver', async () => {
    let capturedUser: unknown;

    @Controller('/cookie-user-check')
    @UseMiddleware(JwtMiddleware)
    class CookieUserCheckController {
      @Get('/')
      get() {
        capturedUser = currentUser();
        return { ok: true };
      }
    }

    const httpApp = createApp([http({ controllers: [CookieUserCheckController] })], {
      configs: [CookieDriverConfig],
    });
    const readyApp = await httpApp.ready();

    const { jwtService, shutdown } = await buildCookieJwtService();
    const token = await jwtService.sign({ sub: 'cookie-user-99' });

    const res = await readyApp.http.request('/cookie-user-check/', {
      headers: { Cookie: `auth_token=${token}` },
    });

    expect(res.status).toBe(200);
    expect(capturedUser).toEqual({ sub: 'cookie-user-99' });
    await shutdown();
  });
});
