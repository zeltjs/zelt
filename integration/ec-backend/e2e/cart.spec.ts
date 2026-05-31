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

describe('Cart API', () => {
  let testApp: TestApp;
  let userToken: string;
  let adminToken: string;
  let productId: number;

  beforeAll(async () => {
    testApp = await createTestApp();
    adminToken = await seedAdmin(testApp);

    await registerUser(testApp, {
      email: 'shopper@example.com',
      password: 'shopper-pass123',
      name: 'Shopper',
    });
    const { body } = await loginUser(testApp, {
      email: 'shopper@example.com',
      password: 'shopper-pass123',
    });
    userToken = body.token;

    const productRes = await authRequest(testApp, adminToken, 'POST', '/api/products', {
      name: 'Cart Test Product',
      description: 'For cart tests',
      price: 1500,
      category: 'electronics',
      stock: 20,
    });
    const product = await productRes.json();
    productId = product.id;
  });

  afterAll(async () => {
    await shutdownAll();
  });

  describe('GET /api/cart', () => {
    it('returns empty cart initially', async () => {
      const res = await authRequest(testApp, userToken, 'GET', '/api/cart');
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.items).toEqual([]);
      expect(body.total).toBe(0);
    });

    it('requires authentication', async () => {
      const res = await testApp.http.request('/api/cart');
      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/cart/items', () => {
    it('adds item to cart', async () => {
      const res = await authRequest(testApp, userToken, 'POST', '/api/cart/items', {
        productId,
        quantity: 2,
      });
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.items).toHaveLength(1);
      expect(body.items[0].productId).toBe(productId);
      expect(body.items[0].quantity).toBe(2);
      expect(body.items[0].price).toBe(1500);
    });

    it('increases quantity when adding same product', async () => {
      const res = await authRequest(testApp, userToken, 'POST', '/api/cart/items', {
        productId,
        quantity: 3,
      });
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.items).toHaveLength(1);
      expect(body.items[0].quantity).toBe(5);
    });

    it('rejects non-existent product', async () => {
      const res = await authRequest(testApp, userToken, 'POST', '/api/cart/items', {
        productId: 99999,
        quantity: 1,
      });
      expect(res.status).toBe(404);
    });

    it('rejects quantity exceeding stock', async () => {
      const res = await authRequest(testApp, userToken, 'POST', '/api/cart/items', {
        productId,
        quantity: 100,
      });
      expect(res.status).toBe(409);
    });
  });

  describe('PUT /api/cart/items/:productId', () => {
    it('updates item quantity', async () => {
      const res = await authRequest(testApp, userToken, 'PUT', `/api/cart/items/${productId}`, {
        quantity: 1,
      });
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.items[0].quantity).toBe(1);
    });

    it('removes item when quantity is 0', async () => {
      const res = await authRequest(testApp, userToken, 'PUT', `/api/cart/items/${productId}`, {
        quantity: 0,
      });
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.items).toHaveLength(0);
    });
  });

  describe('DELETE /api/cart/items/:productId', () => {
    it('removes item from cart', async () => {
      await authRequest(testApp, userToken, 'POST', '/api/cart/items', {
        productId,
        quantity: 3,
      });

      const res = await authRequest(testApp, userToken, 'DELETE', `/api/cart/items/${productId}`);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.items).toHaveLength(0);
    });
  });

  describe('DELETE /api/cart', () => {
    it('clears the cart', async () => {
      await authRequest(testApp, userToken, 'POST', '/api/cart/items', {
        productId,
        quantity: 2,
      });

      const clearRes = await authRequest(testApp, userToken, 'DELETE', '/api/cart');
      expect(clearRes.status).toBe(200);

      const cartRes = await authRequest(testApp, userToken, 'GET', '/api/cart');
      const body = await cartRes.json();
      expect(body.items).toEqual([]);
    });
  });

  describe('User scope isolation', () => {
    it('different users have separate carts', async () => {
      await registerUser(testApp, {
        email: 'other-shopper@example.com',
        password: 'other-pass123',
        name: 'Other Shopper',
      });
      const { body: otherLogin } = await loginUser(testApp, {
        email: 'other-shopper@example.com',
        password: 'other-pass123',
      });
      const otherToken = otherLogin.token;

      await authRequest(testApp, userToken, 'POST', '/api/cart/items', {
        productId,
        quantity: 5,
      });

      const otherCart = await authRequest(testApp, otherToken, 'GET', '/api/cart');
      const otherBody = await otherCart.json();
      expect(otherBody.items).toEqual([]);

      const myCart = await authRequest(testApp, userToken, 'GET', '/api/cart');
      const myBody = await myCart.json();
      expect(myBody.items).toHaveLength(1);
      expect(myBody.items[0].quantity).toBe(5);
    });
  });
});
