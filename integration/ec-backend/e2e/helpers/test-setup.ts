import { onTest, shutdownAll } from '@zeltjs/testing';

import { createEcApp } from '../../src/app';

export type TestApp = Awaited<ReturnType<typeof createTestApp>>;

export const createTestApp = async () => {
  const app = createEcApp();
  return onTest(app);
};

export const registerUser = async (
  app: TestApp,
  data: { email: string; password: string; name: string },
) => {
  const res = await app.http.request('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify(data),
    headers: { 'Content-Type': 'application/json' },
  });
  return { res, body: await res.json() };
};

export const loginUser = async (app: TestApp, data: { email: string; password: string }) => {
  const res = await app.http.request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(data),
    headers: { 'Content-Type': 'application/json' },
  });
  return { res, body: await res.json() };
};

export const seedAdmin = async (app: TestApp): Promise<string> => {
  await registerUser(app, {
    email: 'admin@example.com',
    password: 'admin-password-123',
    name: 'Admin User',
  });

  // Directly update role via drizzle
  const drizzle = await app.get((await import('../../src/db/drizzle.service')).DrizzleService);
  const { users } = await import('../../src/db/schema');
  const { eq } = await import('drizzle-orm');
  drizzle.db.update(users).set({ role: 'admin' }).where(eq(users.email, 'admin@example.com')).run();

  const { body } = await loginUser(app, {
    email: 'admin@example.com',
    password: 'admin-password-123',
  });
  return body.token;
};

export const authRequest = (
  app: TestApp,
  token: string,
  method: string,
  path: string,
  body?: unknown,
) => {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
  };
  const init: RequestInit = { method, headers };
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  return app.http.request(path, init);
};

export { shutdownAll };
