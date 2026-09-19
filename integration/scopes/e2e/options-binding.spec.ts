import { Controller, UseMiddleware } from '@zeltjs/core';
import { onTest, shutdownAll } from '@zeltjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { app } from '../src/app';
import { UserAuthMiddleware } from '../src/user-auth.middleware';

type AuthResponse = {
  id: string;
  role: string;
};

describe('Middleware with Options binding', () => {
  let testApp: Awaited<ReturnType<(typeof app)['createRuntime']>>;

  beforeAll(async () => {
    testApp = await onTest(app);
  });

  afterAll(async () => {
    await shutdownAll();
  });

  it('connects @UseMiddleware and middlewareValue() through a shared const binding', async () => {
    const res = await testApp.http.request('/options/admin/me');
    expect(res.status).toBe(200);
    const body = (await res.json()) as AuthResponse;
    expect(body).toEqual({ id: 'user-admin', role: 'admin' });
  });

  it('runs two distinct bindings of the same middleware class independently', async () => {
    const adminRes = await testApp.http.request('/options/admin/me');
    const memberRes = await testApp.http.request('/options/member/me');

    const admin = (await adminRes.json()) as AuthResponse;
    const member = (await memberRes.json()) as AuthResponse;

    expect(admin).toEqual({ id: 'user-admin', role: 'admin' });
    expect(member).toEqual({ id: 'user-member', role: 'member' });
  });

  it('resolves both bindings independently within a single request when applied together', async () => {
    const res = await testApp.http.request('/options/both/me');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { admin: AuthResponse; member: AuthResponse };

    expect(body.admin).toEqual({ id: 'user-admin', role: 'admin' });
    expect(body.member).toEqual({ id: 'user-member', role: 'member' });
  });

  it('fails when middlewareValue() reads a binding that is not applied to the route', async () => {
    // Only memberAuth is applied to this route; reading adminAuth's value
    // must fail because that exact binding never ran here.
    const res = await testApp.http.request('/options/member-only/read-unapplied-binding');
    expect(res.status).toBe(500);
  });

  it('rejects registering an options-required middleware without .with() (type-level)', () => {
    const registerBare = () => {
      // @ts-expect-error UserAuthMiddleware requires options — the bare class
      // has no options for it to run with, so registering it without .with()
      // must be a type error.
      @UseMiddleware(UserAuthMiddleware)
      @Controller('/options/type-error-test')
      class TypeErrorController {}
      return TypeErrorController;
    };
    void registerBare;
  });
});
