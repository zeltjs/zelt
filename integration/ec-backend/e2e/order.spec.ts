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

describe('Order API', () => {
  let testApp: TestApp;
  let userToken: string;
  let adminToken: string;
  let productId1: number;
  let productId2: number;

  beforeAll(async () => {
    testApp = await createTestApp();
    adminToken = await seedAdmin(testApp);

    await registerUser(testApp, {
      email: 'buyer@example.com',
      password: 'buyer-pass123',
      name: 'Buyer',
    });
    const { body } = await loginUser(testApp, {
      email: 'buyer@example.com',
      password: 'buyer-pass123',
    });
    userToken = body.token;

    const p1 = await authRequest(testApp, adminToken, 'POST', '/api/products', {
      name: 'Order Product 1',
      description: 'First product',
      price: 1000,
      category: 'electronics',
      stock: 10,
    });
    productId1 = (await p1.json()).id;

    const p2 = await authRequest(testApp, adminToken, 'POST', '/api/products', {
      name: 'Order Product 2',
      description: 'Second product',
      price: 2000,
      category: 'clothing',
      stock: 5,
    });
    productId2 = (await p2.json()).id;
  });

  afterAll(async () => {
    await shutdownAll();
  });

  describe('POST /api/orders', () => {
    it('creates order from cart', async () => {
      await authRequest(testApp, userToken, 'POST', '/api/cart/items', {
        productId: productId1,
        quantity: 2,
      });
      await authRequest(testApp, userToken, 'POST', '/api/cart/items', {
        productId: productId2,
        quantity: 1,
      });

      const res = await authRequest(testApp, userToken, 'POST', '/api/orders');
      expect(res.status).toBe(201);

      const order = await res.json();
      expect(order.id).toBeDefined();
      expect(order.totalPrice).toBe(2 * 1000 + 1 * 2000);
      expect(order.status).toBe('confirmed');
    });

    it('clears cart after order', async () => {
      const cartRes = await authRequest(testApp, userToken, 'GET', '/api/cart');
      const cart = await cartRes.json();
      expect(cart.items).toEqual([]);
    });

    it('reduces product stock', async () => {
      const p1Res = await testApp.request(`/api/products/${productId1}`);
      const p1 = await p1Res.json();
      expect(p1.stock).toBe(8);

      const p2Res = await testApp.request(`/api/products/${productId2}`);
      const p2 = await p2Res.json();
      expect(p2.stock).toBe(4);
    });

    it('rejects order with empty cart', async () => {
      const res = await authRequest(testApp, userToken, 'POST', '/api/orders');
      expect(res.status).toBe(400);
    });

    it('rejects adding out-of-stock product to cart', async () => {
      // productId2 stock was reduced by previous orders, check remaining
      const pRes = await testApp.request(`/api/products/${productId2}`);
      const product = await pRes.json();

      // Try to add more than available stock
      const res = await authRequest(testApp, userToken, 'POST', '/api/cart/items', {
        productId: productId2,
        quantity: product.stock + 1,
      });
      // CartService checks stock at add time
      expect(res.status).toBe(409);
    });
  });

  describe('GET /api/orders', () => {
    it('lists own orders', async () => {
      const res = await authRequest(testApp, userToken, 'GET', '/api/orders');
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.items.length).toBeGreaterThan(0);
      expect(body.total).toBeGreaterThan(0);
    });

    it('does not show other users orders', async () => {
      await registerUser(testApp, {
        email: 'other-buyer@example.com',
        password: 'other-pass123',
        name: 'Other Buyer',
      });
      const { body: otherLogin } = await loginUser(testApp, {
        email: 'other-buyer@example.com',
        password: 'other-pass123',
      });

      const res = await authRequest(testApp, otherLogin.token, 'GET', '/api/orders');
      const body = await res.json();
      expect(body.items).toEqual([]);
      expect(body.total).toBe(0);
    });

    it('requires authentication', async () => {
      const res = await testApp.request('/api/orders');
      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/orders/:id', () => {
    it('returns order with items', async () => {
      const listRes = await authRequest(testApp, userToken, 'GET', '/api/orders');
      const list = await listRes.json();
      const orderId = list.items[0].id;

      const res = await authRequest(testApp, userToken, 'GET', `/api/orders/${orderId}`);
      expect(res.status).toBe(200);

      const order = await res.json();
      expect(order.id).toBe(orderId);
      expect(order.items).toBeDefined();
      expect(order.items.length).toBeGreaterThan(0);
    });

    it('returns 404 for other users order', async () => {
      const { body: otherLogin } = await loginUser(testApp, {
        email: 'other-buyer@example.com',
        password: 'other-pass123',
      });

      const listRes = await authRequest(testApp, userToken, 'GET', '/api/orders');
      const list = await listRes.json();
      const orderId = list.items[0].id;

      const res = await authRequest(testApp, otherLogin.token, 'GET', `/api/orders/${orderId}`);
      expect(res.status).toBe(404);
    });
  });
});
