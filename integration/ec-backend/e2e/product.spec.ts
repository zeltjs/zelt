import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TestApp } from './helpers/test-setup';
import { authRequest, createTestApp, seedAdmin, shutdownAll } from './helpers/test-setup';

describe('Product API', () => {
  let testApp: TestApp;
  let adminToken: string;

  beforeAll(async () => {
    testApp = await createTestApp();
    adminToken = await seedAdmin(testApp);
  });

  afterAll(async () => {
    await shutdownAll();
  });

  const createProduct = (data: Record<string, unknown>) =>
    authRequest(testApp, adminToken, 'POST', '/api/products', data);

  describe('GET /api/products', () => {
    it('returns empty list initially', async () => {
      const res = await testApp.http.request('/api/products');
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.items).toEqual([]);
      expect(body.total).toBe(0);
      expect(body.page).toBe(1);
    });

    it('uses default pagination', async () => {
      const res = await testApp.http.request('/api/products');
      const body = await res.json();
      expect(body.page).toBe(1);
      expect(body.limit).toBe(20);
    });
  });

  describe('POST /api/products', () => {
    it('creates a product', async () => {
      const res = await createProduct({
        name: 'Test Product',
        description: 'A great product',
        price: 1999,
        category: 'electronics',
        stock: 50,
      });
      expect(res.status).toBe(201);

      const product = await res.json();
      expect(product.id).toBeDefined();
      expect(product.name).toBe('Test Product');
      expect(product.price).toBe(1999);
      expect(product.category).toBe('electronics');
      expect(product.stock).toBe(50);
    });

    it('rejects invalid data', async () => {
      const res = await createProduct({ name: '', price: -1 });
      expect(res.status).toBe(400);

      const body = await res.json();
      expect(body.code).toBe('VALIDATION_FAILED');
    });

    it('rejects missing required fields', async () => {
      const res = await createProduct({});
      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/products/:id', () => {
    it('returns product detail', async () => {
      const createRes = await createProduct({
        name: 'Detail Product',
        description: 'For detail test',
        price: 500,
        category: 'books',
        stock: 10,
      });
      const created = await createRes.json();

      const res = await testApp.http.request(`/api/products/${created.id}`);
      expect(res.status).toBe(200);

      const product = await res.json();
      expect(product.name).toBe('Detail Product');
      expect(product.id).toBe(created.id);
    });

    it('returns 404 for non-existent product', async () => {
      const res = await testApp.http.request('/api/products/99999');
      expect(res.status).toBe(404);
    });

    it('returns 400 for invalid id', async () => {
      const res = await testApp.http.request('/api/products/abc');
      expect(res.status).toBe(400);
    });
  });

  describe('PUT /api/products/:id', () => {
    it('updates a product', async () => {
      const createRes = await createProduct({
        name: 'Before Update',
        description: 'Original',
        price: 1000,
        category: 'clothing',
        stock: 5,
      });
      const created = await createRes.json();

      const res = await authRequest(testApp, adminToken, 'PUT', `/api/products/${created.id}`, {
        name: 'After Update',
        price: 1500,
      });
      expect(res.status).toBe(200);

      const updated = await res.json();
      expect(updated.name).toBe('After Update');
      expect(updated.price).toBe(1500);
      expect(updated.description).toBe('Original');
    });

    it('returns 404 for non-existent product', async () => {
      const res = await authRequest(testApp, adminToken, 'PUT', '/api/products/99999', {
        name: 'Ghost',
      });
      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api/products/:id', () => {
    it('deletes a product', async () => {
      const createRes = await createProduct({
        name: 'To Delete',
        description: 'Will be deleted',
        price: 100,
        category: 'misc',
        stock: 1,
      });
      const created = await createRes.json();

      const deleteRes = await authRequest(
        testApp,
        adminToken,
        'DELETE',
        `/api/products/${created.id}`,
      );
      expect(deleteRes.status).toBe(200);

      const getRes = await testApp.http.request(`/api/products/${created.id}`);
      expect(getRes.status).toBe(404);
    });

    it('returns 404 for non-existent product', async () => {
      const res = await authRequest(testApp, adminToken, 'DELETE', '/api/products/99999');
      expect(res.status).toBe(404);
    });
  });

  describe('Pagination and filtering', () => {
    let paginationApp: TestApp;
    let paginationAdminToken: string;

    beforeAll(async () => {
      paginationApp = await createTestApp();
      paginationAdminToken = await seedAdmin(paginationApp);

      for (let i = 1; i <= 15; i++) {
        await authRequest(paginationApp, paginationAdminToken, 'POST', '/api/products', {
          name: `Product ${i}`,
          description: `Description ${i}`,
          price: i * 100,
          category: i <= 10 ? 'electronics' : 'clothing',
          stock: i,
        });
      }
    });

    it('paginates results', async () => {
      const res = await paginationApp.http.request('/api/products?page=2&limit=5');
      const body = await res.json();
      expect(body.items).toHaveLength(5);
      expect(body.page).toBe(2);
      expect(body.limit).toBe(5);
      expect(body.total).toBe(15);
    });

    it('filters by category', async () => {
      const res = await paginationApp.http.request('/api/products?category=clothing');
      const body = await res.json();
      expect(body.total).toBe(5);
      expect(body.items.every((p: { category: string }) => p.category === 'clothing')).toBe(true);
    });

    it('filters by price range', async () => {
      const res = await paginationApp.http.request('/api/products?minPrice=500&maxPrice=1000');
      const body = await res.json();
      expect(body.items.every((p: { price: number }) => p.price >= 500 && p.price <= 1000)).toBe(
        true,
      );
    });

    it('ignores invalid query params gracefully', async () => {
      const res = await paginationApp.http.request('/api/products?page=abc&limit=-5');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.page).toBe(1);
      expect(body.limit).toBe(1);
    });
  });
});
