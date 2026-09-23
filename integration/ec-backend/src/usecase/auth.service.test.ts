import { JwtService } from '@zeltjs/auth-jwt';
import type { TestTargetResult } from '@zeltjs/testing';
import { createTestTarget } from '@zeltjs/testing';
import { eq } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { EcJwtConfig } from '../config/ec-jwt.config';
import { DrizzleService } from '../infra/db/drizzle.service';
import { users } from '../infra/db/schema';
import { AuthService } from './auth.service';

const alice = { email: 'alice@example.com', password: 'alice-password', name: 'Alice' };

describe('AuthService (sociable: real DrizzleService and JwtService)', () => {
  let testTarget: TestTargetResult<AuthService>;
  let authService: AuthService;
  let drizzle: DrizzleService;
  let jwtService: JwtService;

  beforeEach(async () => {
    testTarget = await createTestTarget(AuthService, { configs: [EcJwtConfig] });
    authService = testTarget.target;
    drizzle = await testTarget.get(DrizzleService);
    jwtService = await testTarget.get(JwtService);
  });

  afterEach(async () => {
    await testTarget.shutdown();
  });

  const storedUser = (email: string) =>
    drizzle.db.select().from(users).where(eq(users.email, email)).get();

  describe('register', () => {
    it('returns the public fields of the new user', async () => {
      const result = await authService.register(alice);

      expect(result).toEqual({ id: expect.any(Number), email: alice.email, name: alice.name });
      expect(result).not.toHaveProperty('passwordHash');
    });

    it('stores a salted scrypt hash instead of the plain password', async () => {
      await authService.register(alice);

      const hash = storedUser(alice.email)?.passwordHash ?? '';
      expect(hash).not.toContain(alice.password);
      expect(hash).toMatch(/^[0-9a-f]{32}:[0-9a-f]{128}$/);
    });

    it('uses a fresh salt so equal passwords produce different hashes', async () => {
      await authService.register(alice);
      await authService.register({ ...alice, email: 'alice2@example.com' });

      expect(storedUser(alice.email)?.passwordHash).not.toBe(
        storedUser('alice2@example.com')?.passwordHash,
      );
    });

    it('assigns the default user role', async () => {
      await authService.register(alice);

      expect(storedUser(alice.email)?.role).toBe('user');
    });

    it('assigns distinct ids to different users', async () => {
      const first = await authService.register(alice);
      const second = await authService.register({ ...alice, email: 'bob@example.com' });

      expect(second.id).not.toBe(first.id);
    });

    it('rejects a duplicate email with 409 and keeps the original user', async () => {
      await authService.register(alice);
      const result = authService.register({ ...alice, name: 'Impostor' });

      await expect(result).rejects.toThrow(HTTPException);
      await expect(result).rejects.toMatchObject({ status: 409, message: 'Email already exists' });
      expect(storedUser(alice.email)?.name).toBe('Alice');
    });

    it('treats emails differing only in case as different users (現状の振る舞い)', async () => {
      await authService.register(alice);

      await expect(
        authService.register({ ...alice, email: 'ALICE@example.com' }),
      ).resolves.toMatchObject({ email: 'ALICE@example.com' });
    });
  });

  describe('login', () => {
    it('returns a token whose claims identify the user', async () => {
      const registered = await authService.register(alice);

      const { token } = await authService.login(alice.email, alice.password);
      const payload = await jwtService.verify(token);

      expect(payload.sub).toBe(String(registered.id));
      expect(payload['email']).toBe(alice.email);
      expect(payload['roles']).toEqual(['user']);
    });

    it('puts the stored role into the token', async () => {
      await authService.register(alice);
      drizzle.db.update(users).set({ role: 'admin' }).where(eq(users.email, alice.email)).run();

      const { token } = await authService.login(alice.email, alice.password);

      expect((await jwtService.verify(token))['roles']).toEqual(['admin']);
    });

    it('rejects a wrong password with 401', async () => {
      await authService.register(alice);

      await expect(authService.login(alice.email, 'wrong-password')).rejects.toMatchObject({
        status: 401,
        message: 'Invalid credentials',
      });
    });

    it('rejects an unknown email with the same 401 as a wrong password', async () => {
      await expect(authService.login('nobody@example.com', alice.password)).rejects.toMatchObject({
        status: 401,
        message: 'Invalid credentials',
      });
    });

    it('rejects an empty password', async () => {
      await authService.register(alice);

      await expect(authService.login(alice.email, '')).rejects.toMatchObject({ status: 401 });
    });

    it('rejects a stored hash without a salt separator with 401', async () => {
      await authService.register(alice);
      drizzle.db
        .update(users)
        .set({ passwordHash: 'no-separator' })
        .where(eq(users.email, alice.email))
        .run();

      await expect(authService.login(alice.email, alice.password)).rejects.toMatchObject({
        status: 401,
      });
    });

    it('throws a RangeError instead of 401 when the stored key has the wrong length (現状の振る舞い)', async () => {
      await authService.register(alice);
      drizzle.db
        .update(users)
        .set({ passwordHash: 'abcd:abcd' })
        .where(eq(users.email, alice.email))
        .run();

      await expect(authService.login(alice.email, alice.password)).rejects.toThrow(RangeError);
    });

    it('is case-sensitive on email (現状の振る舞い)', async () => {
      await authService.register(alice);

      await expect(authService.login('ALICE@example.com', alice.password)).rejects.toMatchObject({
        status: 401,
      });
    });
  });

  describe('getProfile', () => {
    it('returns the profile including the role', async () => {
      const registered = await authService.register(alice);

      const profile = await authService.getProfile(registered.id);

      expect(profile).toEqual({
        id: registered.id,
        email: alice.email,
        name: alice.name,
        role: 'user',
      });
    });

    it('reflects a role change', async () => {
      const registered = await authService.register(alice);
      drizzle.db.update(users).set({ role: 'admin' }).where(eq(users.id, registered.id)).run();

      expect((await authService.getProfile(registered.id))?.role).toBe('admin');
    });

    it('returns undefined for an unknown id', async () => {
      expect(await authService.getProfile(404)).toBeUndefined();
    });

    it('never exposes the password hash', async () => {
      const registered = await authService.register(alice);

      expect(await authService.getProfile(registered.id)).not.toHaveProperty('passwordHash');
    });
  });
});

describe('AuthService (JwtService replaced, real DrizzleService)', () => {
  let testTarget: TestTargetResult<AuthService>;
  let authService: AuthService;
  let signedPayloads: Record<string, unknown>[];

  beforeEach(async () => {
    signedPayloads = [];
    const fakeJwtService: Pick<JwtService, 'sign'> = {
      sign: async (payload) => {
        signedPayloads.push(payload);
        return `signed-token-${signedPayloads.length}`;
      },
    };

    testTarget = await createTestTarget(AuthService, {
      overrides: [{ provide: JwtService, useValue: fakeJwtService }],
    });
    authService = testTarget.target;
  });

  afterEach(async () => {
    await testTarget.shutdown();
  });

  it('returns the token produced by JwtService', async () => {
    await authService.register(alice);

    const result = await authService.login(alice.email, alice.password);

    expect(result).toEqual({ token: 'signed-token-1' });
  });

  it('signs sub as a string, email and the role list', async () => {
    const registered = await authService.register(alice);

    await authService.login(alice.email, alice.password);

    expect(signedPayloads).toEqual([
      { sub: String(registered.id), email: alice.email, roles: ['user'] },
    ]);
  });

  it('does not sign anything when the password is wrong', async () => {
    await authService.register(alice);

    await expect(authService.login(alice.email, 'wrong-password')).rejects.toMatchObject({
      status: 401,
    });
    expect(signedPayloads).toEqual([]);
  });

  it('does not sign anything when the user is unknown', async () => {
    await expect(authService.login(alice.email, alice.password)).rejects.toMatchObject({
      status: 401,
    });
    expect(signedPayloads).toEqual([]);
  });

  it('does not sign anything on register', async () => {
    await authService.register(alice);

    expect(signedPayloads).toEqual([]);
  });

  it('signs once per successful login', async () => {
    await authService.register(alice);

    await authService.login(alice.email, alice.password);
    const second = await authService.login(alice.email, alice.password);

    expect(second).toEqual({ token: 'signed-token-2' });
    expect(signedPayloads).toHaveLength(2);
  });
});
