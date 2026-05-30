import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  type TestApp,
  authRequest,
  createTestApp,
  loginUser,
  registerUser,
  seedAdmin,
  shutdownAll,
} from './helpers/test-setup';

describe('Full EC Flow', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await createTestApp();
  });

  afterAll(async () => {
    await shutdownAll();
  });

  it('completes a full user journey: register → login → browse → cart → order', async () => {
    // 1. Admin creates products
    const adminToken = await seedAdmin(testApp);

    const laptop = await authRequest(testApp, adminToken, 'POST', '/api/products', {
      name: 'Laptop Pro',
      description: 'High-performance laptop',
      price: 150000,
      category: 'electronics',
      stock: 5,
    }).then((r) => r.json());

    const keyboard = await authRequest(testApp, adminToken, 'POST', '/api/products', {
      name: 'Mechanical Keyboard',
      description: 'Cherry MX switches',
      price: 12000,
      category: 'electronics',
      stock: 20,
    }).then((r) => r.json());

    // 2. User registers
    const { body: regBody } = await registerUser(testApp, {
      email: 'customer@example.com',
      password: 'customer-pass123',
      name: 'Customer',
    });
    expect(regBody.email).toBe('customer@example.com');

    // 3. User logs in
    const { body: loginBody } = await loginUser(testApp, {
      email: 'customer@example.com',
      password: 'customer-pass123',
    });
    const token = loginBody.token;
    expect(token).toBeDefined();

    // 4. Browse products (public)
    const productsRes = await testApp.request('/api/products');
    const products = await productsRes.json();
    expect(products.items.length).toBeGreaterThanOrEqual(2);

    // 5. Add items to cart
    await authRequest(testApp, token, 'POST', '/api/cart/items', {
      productId: laptop.id,
      quantity: 1,
    });
    await authRequest(testApp, token, 'POST', '/api/cart/items', {
      productId: keyboard.id,
      quantity: 2,
    });

    // Verify cart
    const cartRes = await authRequest(testApp, token, 'GET', '/api/cart');
    const cart = await cartRes.json();
    expect(cart.items).toHaveLength(2);
    expect(cart.total).toBe(150000 + 12000 * 2);

    // 6. Create order from cart
    const orderRes = await authRequest(testApp, token, 'POST', '/api/orders');
    expect(orderRes.status).toBe(201);
    const order = await orderRes.json();
    expect(order.totalPrice).toBe(150000 + 12000 * 2);
    expect(order.status).toBe('confirmed');

    // 7. Verify cart is empty
    const emptyCartRes = await authRequest(testApp, token, 'GET', '/api/cart');
    const emptyCart = await emptyCartRes.json();
    expect(emptyCart.items).toEqual([]);

    // 8. Verify stock reduced
    const laptopAfter = await testApp.request(`/api/products/${laptop.id}`).then((r) => r.json());
    expect(laptopAfter.stock).toBe(4);

    const keyboardAfter = await testApp
      .request(`/api/products/${keyboard.id}`)
      .then((r) => r.json());
    expect(keyboardAfter.stock).toBe(18);

    // 9. Verify order in list
    const ordersRes = await authRequest(testApp, token, 'GET', '/api/orders');
    const orders = await ordersRes.json();
    expect(orders.items).toHaveLength(1);
    expect(orders.items[0].id).toBe(order.id);

    // 10. Verify order detail with items
    const detailRes = await authRequest(testApp, token, 'GET', `/api/orders/${order.id}`);
    const detail = await detailRes.json();
    expect(detail.items).toHaveLength(2);
  });
});
