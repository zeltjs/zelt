import { JwtService } from '@zeltjs/auth-jwt';
import type { TestTargetResult } from '@zeltjs/testing';
import { createTestTarget } from '@zeltjs/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { EcJwtConfig } from './ec-jwt.config';

describe('EcJwtConfig', () => {
  let testTarget: TestTargetResult<EcJwtConfig>;
  let config: EcJwtConfig;

  beforeEach(async () => {
    testTarget = await createTestTarget(EcJwtConfig, { configs: [EcJwtConfig] });
    config = testTarget.target;
  });

  afterEach(async () => {
    await testTarget.shutdown();
  });

  describe('resolveUser', () => {
    it('builds an EcUser with a numeric id from sub and email', async () => {
      const result = await config.resolveUser({
        sub: '42',
        email: 'alice@example.com',
        roles: ['user'],
      });

      expect(result).toEqual({
        user: { id: 42, email: 'alice@example.com' },
        roles: ['user'],
      });
    });

    it('keeps multiple roles in order', async () => {
      const result = await config.resolveUser({
        sub: '1',
        email: 'admin@example.com',
        roles: ['admin', 'user'],
      });

      expect(result.roles).toEqual(['admin', 'user']);
    });

    it('falls back to id 0 when sub is missing', async () => {
      const result = await config.resolveUser({ email: 'alice@example.com', roles: [] });

      expect(result.user).toEqual({ id: 0, email: 'alice@example.com' });
    });

    it('falls back to an empty email when email is missing', async () => {
      const result = await config.resolveUser({ sub: '7', roles: [] });

      expect(result.user).toEqual({ id: 7, email: '' });
    });

    it('falls back to no roles when roles are missing', async () => {
      const result = await config.resolveUser({ sub: '7', email: 'alice@example.com' });

      expect(result.roles).toEqual([]);
    });

    it('parses only the leading digits of sub', async () => {
      const result = await config.resolveUser({ sub: '12abc', email: 'a@example.com' });

      expect(result.user).toEqual({ id: 12, email: 'a@example.com' });
    });

    it('yields NaN as id when sub is not numeric (現状の振る舞い)', async () => {
      const result = await config.resolveUser({ sub: 'abc', email: 'a@example.com' });

      expect(result.user['id']).toBeNaN();
    });

    it('passes a non-string email through unchecked (現状の振る舞い)', async () => {
      const result = await config.resolveUser({ sub: '1', email: 123 });

      expect(result.user['email']).toBe(123);
    });
  });

  it('uses a fixed secret for the sample app', () => {
    expect(config.secret).toBe('ec-backend-test-secret-key-do-not-use-in-production');
  });

  it('issues tokens that expire in 24 hours', () => {
    expect(config.expiresIn).toBe('24h');
  });
});

describe('EcJwtConfig with the real JwtService', () => {
  let testTarget: TestTargetResult<JwtService>;
  let jwtService: JwtService;

  beforeEach(async () => {
    testTarget = await createTestTarget(JwtService, { configs: [EcJwtConfig] });
    jwtService = testTarget.target;
  });

  afterEach(async () => {
    await testTarget.shutdown();
  });

  it('signs tokens that expire 24 hours after issue', async () => {
    const token = await jwtService.sign({ sub: '1', email: 'a@example.com', roles: ['user'] });
    const payload = await jwtService.verify(token);

    expect(payload.exp).toBeDefined();
    expect(payload.iat).toBeDefined();
    expect((payload.exp ?? 0) - (payload.iat ?? 0)).toBe(24 * 60 * 60);
  });

  it('round-trips claims so that resolveUser restores the EcUser', async () => {
    const token = await jwtService.sign({ sub: '5', email: 'bob@example.com', roles: ['admin'] });
    const payload = await jwtService.verify(token);
    const config = await testTarget.get(EcJwtConfig);

    const result = await config.resolveUser(payload);

    expect(result).toEqual({ user: { id: 5, email: 'bob@example.com' }, roles: ['admin'] });
  });
});
