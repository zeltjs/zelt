import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TestApp } from './helpers/test-setup';
import {
  authRequest,
  createTestApp,
  loginUser,
  registerUser,
  seedAdmin,
  shutdownAll,
} from './helpers/test-setup';

describe('Auth API', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await createTestApp();
  });

  afterAll(async () => {
    await shutdownAll();
  });

  describe('POST /api/auth/register', () => {
    // Validation tests first (count toward rate limit: 3/min for register)
    it('rejects invalid email', async () => {
      const { res } = await registerUser(testApp, {
        email: 'not-an-email',
        password: 'password123',
        name: 'Bad Email',
      });
      expect(res.status).toBe(400);
    });

    it('rejects short password', async () => {
      const { res } = await registerUser(testApp, {
        email: 'short@example.com',
        password: '123',
        name: 'Short Pass',
      });
      expect(res.status).toBe(400);
    });

    it('registers a new user', async () => {
      const { res, body } = await registerUser(testApp, {
        email: 'user@example.com',
        password: 'password123',
        name: 'Test User',
      });
      expect(res.status).toBe(200);
      expect(body.id).toBeDefined();
      expect(body.email).toBe('user@example.com');
      expect(body.name).toBe('Test User');
      expect(body.passwordHash).toBeUndefined();
    });
  });

  describe('POST /api/auth/login', () => {
    it('logs in with valid credentials', async () => {
      const { res, body } = await loginUser(testApp, {
        email: 'user@example.com',
        password: 'password123',
      });
      expect(res.status).toBe(200);
      expect(body.token).toBeDefined();
      expect(typeof body.token).toBe('string');
    });

    it('rejects wrong password', async () => {
      const res = await testApp.request('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: 'user@example.com', password: 'wrong-password' }),
        headers: { 'Content-Type': 'application/json' },
      });
      expect(res.status).toBe(401);
    });

    it('rejects non-existent user', async () => {
      const res = await testApp.request('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: 'nobody@example.com', password: 'password123' }),
        headers: { 'Content-Type': 'application/json' },
      });
      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/auth/me', () => {
    it('returns profile with valid token', async () => {
      const { body: loginBody } = await loginUser(testApp, {
        email: 'user@example.com',
        password: 'password123',
      });

      const res = await authRequest(testApp, loginBody.token, 'GET', '/api/auth/me');
      expect(res.status).toBe(200);

      const profile = await res.json();
      expect(profile.email).toBe('user@example.com');
      expect(profile.name).toBe('Test User');
      expect(profile.role).toBe('user');
    });

    it('returns 401 without token', async () => {
      const res = await testApp.request('/api/auth/me');
      expect(res.status).toBe(401);
    });

    it('returns 401 with invalid token', async () => {
      const res = await authRequest(testApp, 'invalid-token', 'GET', '/api/auth/me');
      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/auth/register (duplicate)', () => {
    it('rejects duplicate email', async () => {
      // This is a separate describe to manage rate limit ordering
      // user@example.com was registered in the previous describe block
      const res = await testApp.request('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          email: 'user@example.com',
          password: 'another-password',
          name: 'Duplicate User',
        }),
        headers: { 'Content-Type': 'application/json' },
      });
      expect(res.status).toBe(409);
    });
  });

  describe('Product write authorization', () => {
    let authApp: TestApp;
    let adminToken: string;
    let userToken: string;

    beforeAll(async () => {
      authApp = await createTestApp();
      adminToken = await seedAdmin(authApp);

      await registerUser(authApp, {
        email: 'user-auth@example.com',
        password: 'password123',
        name: 'Auth Test User',
      });
      const { body } = await loginUser(authApp, {
        email: 'user-auth@example.com',
        password: 'password123',
      });
      userToken = body.token;
    });

    const productData = {
      name: 'Auth Test Product',
      description: 'Testing authorization',
      price: 999,
      category: 'test',
      stock: 10,
    };

    it('admin can create products', async () => {
      const res = await authRequest(authApp, adminToken, 'POST', '/api/products', productData);
      expect(res.status).toBe(201);
    });

    it('regular user cannot create products', async () => {
      const res = await authRequest(authApp, userToken, 'POST', '/api/products', productData);
      expect(res.status).toBe(403);
    });

    it('unauthenticated cannot create products', async () => {
      const res = await authApp.request('/api/products', {
        method: 'POST',
        body: JSON.stringify(productData),
        headers: { 'Content-Type': 'application/json' },
      });
      expect(res.status).toBe(401);
    });

    it('admin can update products', async () => {
      const createRes = await authRequest(
        authApp,
        adminToken,
        'POST',
        '/api/products',
        productData,
      );
      const created = await createRes.json();

      const res = await authRequest(authApp, adminToken, 'PUT', `/api/products/${created.id}`, {
        name: 'Updated',
      });
      expect(res.status).toBe(200);
    });

    it('admin can delete products', async () => {
      const createRes = await authRequest(
        authApp,
        adminToken,
        'POST',
        '/api/products',
        productData,
      );
      const created = await createRes.json();

      const res = await authRequest(authApp, adminToken, 'DELETE', `/api/products/${created.id}`);
      expect(res.status).toBe(200);
    });

    it('regular user cannot delete products', async () => {
      const createRes = await authRequest(
        authApp,
        adminToken,
        'POST',
        '/api/products',
        productData,
      );
      const created = await createRes.json();

      const res = await authRequest(authApp, userToken, 'DELETE', `/api/products/${created.id}`);
      expect(res.status).toBe(403);
    });
  });
});
