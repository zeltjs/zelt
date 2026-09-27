import type { TestTargetResult } from '@zeltjs/testing';
import { createTestTarget } from '@zeltjs/testing';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { CreateProductInput } from '../domain/product.schema';
import { DrizzleService } from '../infra/db/drizzle.service';
import { orderItems, orders, products, users } from '../infra/db/schema';
import { ProductService } from './product.service';

const productInput = (overrides: Partial<CreateProductInput> = {}): CreateProductInput => ({
  name: 'Keyboard',
  description: 'Mechanical keyboard',
  price: 1000,
  category: 'electronics',
  stock: 10,
  ...overrides,
});

const seedProduct = (drizzle: DrizzleService, overrides: Partial<CreateProductInput> = {}) =>
  drizzle.db
    .insert(products)
    .values({ ...productInput(overrides), createdAt: new Date(), updatedAt: new Date() })
    .returning()
    .get();

describe('ProductService with the real DrizzleService', () => {
  let testTarget: TestTargetResult<ProductService>;
  let productService: ProductService;
  let drizzle: DrizzleService;

  beforeEach(async () => {
    testTarget = await createTestTarget(ProductService);
    productService = testTarget.target;
    drizzle = await testTarget.get(DrizzleService);
  });

  afterEach(async () => {
    vi.useRealTimers();
    await testTarget.shutdown();
  });

  describe('findAll', () => {
    it('returns no items and a zero total when there are no products', async () => {
      const result = await productService.findAll({ page: 1, limit: 10 });

      expect(result).toEqual({ items: [], total: 0 });
    });

    it('returns every product when no filter is given', async () => {
      seedProduct(drizzle, { name: 'A' });
      seedProduct(drizzle, { name: 'B' });

      const result = await productService.findAll({ page: 1, limit: 10 });

      expect(result.items.map((p) => p.name)).toEqual(['A', 'B']);
      expect(result.total).toBe(2);
    });

    it('filters by category', async () => {
      seedProduct(drizzle, { name: 'Laptop', category: 'electronics' });
      seedProduct(drizzle, { name: 'Novel', category: 'books' });

      const result = await productService.findAll({ page: 1, limit: 10, category: 'books' });

      expect(result.items.map((p) => p.name)).toEqual(['Novel']);
      expect(result.total).toBe(1);
    });

    it('treats minPrice as inclusive', async () => {
      seedProduct(drizzle, { name: 'Cheap', price: 999 });
      seedProduct(drizzle, { name: 'Edge', price: 1000 });
      seedProduct(drizzle, { name: 'Pricey', price: 1001 });

      const result = await productService.findAll({ page: 1, limit: 10, minPrice: 1000 });

      expect(result.items.map((p) => p.name)).toEqual(['Edge', 'Pricey']);
    });

    it('treats maxPrice as inclusive', async () => {
      seedProduct(drizzle, { name: 'Cheap', price: 999 });
      seedProduct(drizzle, { name: 'Edge', price: 1000 });
      seedProduct(drizzle, { name: 'Pricey', price: 1001 });

      const result = await productService.findAll({ page: 1, limit: 10, maxPrice: 1000 });

      expect(result.items.map((p) => p.name)).toEqual(['Cheap', 'Edge']);
    });

    it('combines category and price range filters', async () => {
      seedProduct(drizzle, { name: 'Cheap book', category: 'books', price: 500 });
      seedProduct(drizzle, { name: 'Mid book', category: 'books', price: 1500 });
      seedProduct(drizzle, { name: 'Mid gadget', category: 'electronics', price: 1500 });
      seedProduct(drizzle, { name: 'Rare book', category: 'books', price: 9000 });

      const result = await productService.findAll({
        page: 1,
        limit: 10,
        category: 'books',
        minPrice: 1000,
        maxPrice: 2000,
      });

      expect(result.items.map((p) => p.name)).toEqual(['Mid book']);
      expect(result.total).toBe(1);
    });

    it('ignores an empty category string', async () => {
      seedProduct(drizzle, { name: 'A', category: 'books' });
      seedProduct(drizzle, { name: 'B', category: 'toys' });

      const result = await productService.findAll({ page: 1, limit: 10, category: '' });

      expect(result.total).toBe(2);
    });

    it('applies a minPrice of 0 instead of ignoring it', async () => {
      seedProduct(drizzle, { name: 'A', price: 1 });

      const result = await productService.findAll({ page: 1, limit: 10, minPrice: 0 });

      expect(result.total).toBe(1);
    });

    it('limits the page size while reporting the full total', async () => {
      for (const name of ['A', 'B', 'C', 'D', 'E']) seedProduct(drizzle, { name });

      const result = await productService.findAll({ page: 1, limit: 2 });

      expect(result.items.map((p) => p.name)).toEqual(['A', 'B']);
      expect(result.total).toBe(5);
    });

    it('skips earlier pages using the offset', async () => {
      for (const name of ['A', 'B', 'C', 'D', 'E']) seedProduct(drizzle, { name });

      const result = await productService.findAll({ page: 3, limit: 2 });

      expect(result.items.map((p) => p.name)).toEqual(['E']);
      expect(result.total).toBe(5);
    });

    it('returns an empty page beyond the last one but still reports the total', async () => {
      seedProduct(drizzle, { name: 'A' });

      const result = await productService.findAll({ page: 5, limit: 10 });

      expect(result).toEqual({ items: [], total: 1 });
    });

    it('counts only matching products in the total', async () => {
      seedProduct(drizzle, { category: 'books' });
      seedProduct(drizzle, { category: 'books' });
      seedProduct(drizzle, { category: 'toys' });

      const result = await productService.findAll({ page: 1, limit: 1, category: 'books' });

      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(2);
    });
  });

  describe('findById', () => {
    it('returns the product with the given id', async () => {
      const seeded = seedProduct(drizzle, { name: 'Mouse' });

      const found = await productService.findById(seeded.id);

      expect(found).toEqual(seeded);
    });

    it('returns undefined when the product does not exist', async () => {
      const found = await productService.findById(404);

      expect(found).toBeUndefined();
    });

    it('does not return a product that was deleted', async () => {
      const seeded = seedProduct(drizzle);
      drizzle.db.delete(products).where(eq(products.id, seeded.id)).run();

      const found = await productService.findById(seeded.id);

      expect(found).toBeUndefined();
    });
  });

  describe('create', () => {
    it('persists the product and returns it with a generated id', async () => {
      const created = await productService.create(productInput({ name: 'Monitor' }));

      expect(created.id).toBeGreaterThan(0);
      expect(created).toMatchObject(productInput({ name: 'Monitor' }));
      expect(drizzle.db.select().from(products).where(eq(products.id, created.id)).get()).toEqual(
        created,
      );
    });

    it('sets createdAt and updatedAt to the same creation time', async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2026-01-02T03:04:05Z'));

      const created = await productService.create(productInput());

      expect(created.createdAt).toEqual(new Date('2026-01-02T03:04:05Z'));
      expect(created.updatedAt).toEqual(created.createdAt);
    });

    it('assigns increasing ids to consecutive products', async () => {
      const first = await productService.create(productInput({ name: 'First' }));
      const second = await productService.create(productInput({ name: 'Second' }));

      expect(second.id).toBeGreaterThan(first.id);
    });

    it('accepts a product with no stock', async () => {
      const created = await productService.create(productInput({ stock: 0 }));

      expect(created.stock).toBe(0);
    });
  });

  describe('update', () => {
    it('changes only the given fields', async () => {
      const seeded = seedProduct(drizzle, { name: 'Old', price: 100, stock: 3 });

      const updated = await productService.update(seeded.id, { price: 200 });

      expect(updated).toMatchObject({ id: seeded.id, name: 'Old', price: 200, stock: 3 });
    });

    it('refreshes updatedAt but keeps createdAt', async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
      const created = await productService.create(productInput());
      vi.setSystemTime(new Date('2026-02-01T00:00:00Z'));

      const updated = await productService.update(created.id, { name: 'Renamed' });

      expect(updated?.createdAt).toEqual(new Date('2026-01-01T00:00:00Z'));
      expect(updated?.updatedAt).toEqual(new Date('2026-02-01T00:00:00Z'));
    });

    it('persists the change', async () => {
      const seeded = seedProduct(drizzle, { stock: 5 });

      await productService.update(seeded.id, { stock: 0 });

      expect(
        drizzle.db.select().from(products).where(eq(products.id, seeded.id)).get()?.stock,
      ).toBe(0);
    });

    it('only touches updatedAt when no field is given', async () => {
      const seeded = seedProduct(drizzle, { name: 'Same' });

      const updated = await productService.update(seeded.id, {});

      expect(updated).toMatchObject({ name: 'Same', price: seeded.price, stock: seeded.stock });
    });

    it('returns undefined without writing when the product does not exist', async () => {
      const updated = await productService.update(404, { price: 1 });

      expect(updated).toBeUndefined();
      expect(drizzle.db.select().from(products).all()).toEqual([]);
    });

    it('leaves other products untouched', async () => {
      const target = seedProduct(drizzle, { name: 'Target' });
      const other = seedProduct(drizzle, { name: 'Other' });

      await productService.update(target.id, { name: 'Changed' });

      expect(drizzle.db.select().from(products).where(eq(products.id, other.id)).get()).toEqual(
        other,
      );
    });
  });

  describe('remove', () => {
    it('deletes the product and returns true', async () => {
      const seeded = seedProduct(drizzle);

      const removed = await productService.remove(seeded.id);

      expect(removed).toBe(true);
      expect(drizzle.db.select().from(products).all()).toEqual([]);
    });

    it('returns false when the product does not exist', async () => {
      const removed = await productService.remove(404);

      expect(removed).toBe(false);
    });

    it('returns false on a second removal of the same product', async () => {
      const seeded = seedProduct(drizzle);
      await productService.remove(seeded.id);

      const removedAgain = await productService.remove(seeded.id);

      expect(removedAgain).toBe(false);
    });

    it('keeps other products', async () => {
      const target = seedProduct(drizzle, { name: 'Target' });
      seedProduct(drizzle, { name: 'Other' });

      await productService.remove(target.id);

      expect(
        drizzle.db
          .select()
          .from(products)
          .all()
          .map((p) => p.name),
      ).toEqual(['Other']);
    });

    it('throws a raw SQLite error when an order item references the product (現状の振る舞い)', async () => {
      const product = seedProduct(drizzle);
      const user = drizzle.db
        .insert(users)
        .values({ email: 'a@example.com', passwordHash: 'x', name: 'A', createdAt: new Date() })
        .returning()
        .get();
      const order = drizzle.db
        .insert(orders)
        .values({ userId: user.id, totalPrice: 1000, status: 'confirmed', createdAt: new Date() })
        .returning()
        .get();
      drizzle.db
        .insert(orderItems)
        .values({ orderId: order.id, productId: product.id, quantity: 1, unitPrice: 1000 })
        .run();

      await expect(productService.remove(product.id)).rejects.toThrow(
        /FOREIGN KEY constraint failed/,
      );
    });
  });
});
