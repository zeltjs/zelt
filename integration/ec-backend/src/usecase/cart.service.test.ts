import type { Defined, KVAdaptor, KVStore, SetOptions } from '@zeltjs/kv';
import { MemoryKVAdaptor } from '@zeltjs/kv';
import type { TestTargetResult } from '@zeltjs/testing';
import { createTestTarget } from '@zeltjs/testing';
import { HTTPException } from 'hono/http-exception';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { Product } from '../infra/db/schema';
import { CartService } from './cart.service';
import { ProductService } from './product.service';

// KV の契約どおり値はシリアライズして保持し、返す値が保存時の参照を共有しないようにする
class RecordingKVStore implements KVStore {
  readonly values = new Map<string, string>();
  readonly ttls = new Map<string, number | undefined>();
  readonly deletedKeys: string[] = [];

  async get<T>(key: string): Promise<T | undefined> {
    const raw = this.values.get(key);
    return raw === undefined ? undefined : JSON.parse(raw);
  }

  async set<T extends Defined>(key: string, value: T, opts?: SetOptions): Promise<void> {
    this.values.set(key, JSON.stringify(value));
    this.ttls.set(key, opts?.ttlSec);
  }

  async del(key: string): Promise<void> {
    this.deletedKeys.push(key);
    this.values.delete(key);
    this.ttls.delete(key);
  }

  async has(key: string): Promise<boolean> {
    return this.values.has(key);
  }

  async expire(key: string): Promise<boolean> {
    return this.values.has(key);
  }

  namespace(): KVStore {
    throw new Error('CartService does not create nested namespaces');
  }
}

const product = (overrides: Partial<Product> & Pick<Product, 'id'>): Product => ({
  name: `Product ${overrides.id}`,
  description: '',
  price: 1000,
  category: 'general',
  stock: 10,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
  ...overrides,
});

describe('CartService (solitary: ProductService and MemoryKVAdaptor replaced)', () => {
  let testTarget: TestTargetResult<CartService>;
  let cartService: CartService;
  let store: RecordingKVStore;
  let namespaces: string[];
  let catalog: Map<number, Product>;
  let findByIdCalls: number[];

  beforeEach(async () => {
    store = new RecordingKVStore();
    namespaces = [];
    catalog = new Map([
      [1, product({ id: 1, price: 1000, stock: 5 })],
      [2, product({ id: 2, price: 250, stock: 100 })],
      [3, product({ id: 3, price: 50, stock: 0 })],
    ]);
    findByIdCalls = [];
    const fakeKv: Pick<KVAdaptor, 'namespace'> = {
      namespace: (prefix: string) => {
        namespaces.push(prefix);
        return store;
      },
    };
    const fakeProductService: Pick<ProductService, 'findById'> = {
      findById: async (id: number) => {
        findByIdCalls.push(id);
        return catalog.get(id);
      },
    };

    testTarget = await createTestTarget(CartService, {
      overrides: [
        { provide: MemoryKVAdaptor, useValue: fakeKv },
        { provide: ProductService, useValue: fakeProductService },
      ],
    });
    cartService = testTarget.target;
  });

  afterEach(async () => {
    await testTarget.shutdown();
  });

  it('stores carts under the cart: namespace', () => {
    expect(namespaces).toEqual(['cart:']);
  });

  describe('getCart', () => {
    it('returns an empty cart for a user without a stored cart', async () => {
      const cart = await cartService.getCart(1);

      expect(cart).toEqual({ items: [] });
    });

    it('returns the stored cart', async () => {
      await store.set('7', { items: [{ productId: 1, quantity: 2, price: 1000 }] });

      const cart = await cartService.getCart(7);

      expect(cart).toEqual({ items: [{ productId: 1, quantity: 2, price: 1000 }] });
    });

    it('reads the cart keyed by the user id only', async () => {
      await store.set('7', { items: [{ productId: 1, quantity: 2, price: 1000 }] });

      const cart = await cartService.getCart(8);

      expect(cart).toEqual({ items: [] });
    });
  });

  describe('addItem', () => {
    it('adds a new item with the current product price', async () => {
      const cart = await cartService.addItem(1, 1, 2);

      expect(cart).toEqual({ items: [{ productId: 1, quantity: 2, price: 1000 }] });
    });

    it('saves the cart with a one-day TTL', async () => {
      await cartService.addItem(1, 1, 1);

      expect(store.ttls.get('1')).toBe(86400);
      expect(JSON.parse(store.values.get('1') ?? 'null')).toEqual({
        items: [{ productId: 1, quantity: 1, price: 1000 }],
      });
    });

    it('appends different products in insertion order', async () => {
      await cartService.addItem(1, 2, 1);
      const cart = await cartService.addItem(1, 1, 1);

      expect(cart.items.map((item) => item.productId)).toEqual([2, 1]);
    });

    it('increments the quantity of an item already in the cart', async () => {
      await cartService.addItem(1, 1, 2);
      const cart = await cartService.addItem(1, 1, 3);

      expect(cart).toEqual({ items: [{ productId: 1, quantity: 5, price: 1000 }] });
    });

    it('allows adding exactly the available stock', async () => {
      const cart = await cartService.addItem(1, 1, 5);

      expect(cart.items[0]?.quantity).toBe(5);
    });

    it('rejects with 404 when the product does not exist', async () => {
      const result = cartService.addItem(1, 404, 1);

      await expect(result).rejects.toThrow(HTTPException);
      await expect(result).rejects.toMatchObject({ status: 404, message: 'Product not found' });
      expect(store.values.size).toBe(0);
    });

    it('rejects with 409 when the quantity exceeds the stock', async () => {
      await expect(cartService.addItem(1, 1, 6)).rejects.toMatchObject({
        status: 409,
        message: 'Insufficient stock',
      });
      expect(store.values.size).toBe(0);
    });

    it('rejects with 409 for an out-of-stock product', async () => {
      await expect(cartService.addItem(1, 3, 1)).rejects.toMatchObject({ status: 409 });
    });

    it('rejects with 409 when the accumulated quantity exceeds the stock and keeps the cart', async () => {
      await cartService.addItem(1, 1, 3);

      await expect(cartService.addItem(1, 1, 3)).rejects.toMatchObject({ status: 409 });
      expect(await cartService.getCart(1)).toEqual({
        items: [{ productId: 1, quantity: 3, price: 1000 }],
      });
    });

    it('keeps the price captured when the item was first added (現状の振る舞い)', async () => {
      await cartService.addItem(1, 1, 1);
      catalog.set(1, product({ id: 1, price: 1200, stock: 5 }));

      const cart = await cartService.addItem(1, 1, 1);

      expect(cart.items).toEqual([{ productId: 1, quantity: 2, price: 1000 }]);
    });

    it('does not reject a non-positive quantity by itself (現状の振る舞い)', async () => {
      const cart = await cartService.addItem(1, 1, -1);

      expect(cart.items).toEqual([{ productId: 1, quantity: -1, price: 1000 }]);
    });

    it('keeps carts of different users separate', async () => {
      await cartService.addItem(1, 1, 1);
      await cartService.addItem(2, 2, 4);

      expect(await cartService.getCart(1)).toEqual({
        items: [{ productId: 1, quantity: 1, price: 1000 }],
      });
      expect(await cartService.getCart(2)).toEqual({
        items: [{ productId: 2, quantity: 4, price: 250 }],
      });
    });
  });

  describe('updateQuantity', () => {
    it('replaces the quantity of an item in the cart', async () => {
      await cartService.addItem(1, 1, 1);

      const cart = await cartService.updateQuantity(1, 1, 4);

      expect(cart).toEqual({ items: [{ productId: 1, quantity: 4, price: 1000 }] });
      expect(store.ttls.get('1')).toBe(86400);
    });

    it('can lower the quantity', async () => {
      await cartService.addItem(1, 1, 4);

      const cart = await cartService.updateQuantity(1, 1, 1);

      expect(cart.items[0]?.quantity).toBe(1);
    });

    it('updates only the targeted item', async () => {
      await cartService.addItem(1, 1, 1);
      await cartService.addItem(1, 2, 1);

      const cart = await cartService.updateQuantity(1, 2, 7);

      expect(cart.items).toEqual([
        { productId: 1, quantity: 1, price: 1000 },
        { productId: 2, quantity: 7, price: 250 },
      ]);
    });

    it('allows setting exactly the available stock', async () => {
      await cartService.addItem(1, 1, 1);

      const cart = await cartService.updateQuantity(1, 1, 5);

      expect(cart.items[0]?.quantity).toBe(5);
    });

    it('removes the item when the quantity is 0 without looking up the product', async () => {
      await cartService.addItem(1, 1, 1);
      await cartService.addItem(1, 2, 1);
      findByIdCalls.length = 0;

      const cart = await cartService.updateQuantity(1, 1, 0);

      expect(cart.items.map((item) => item.productId)).toEqual([2]);
      expect(findByIdCalls).toEqual([]);
    });

    it('rejects with 404 when the product does not exist', async () => {
      await expect(cartService.updateQuantity(1, 404, 1)).rejects.toMatchObject({
        status: 404,
        message: 'Product not found',
      });
    });

    it('rejects with 409 when the quantity exceeds the stock', async () => {
      await cartService.addItem(1, 1, 1);

      await expect(cartService.updateQuantity(1, 1, 6)).rejects.toMatchObject({
        status: 409,
        message: 'Insufficient stock',
      });
      expect((await cartService.getCart(1)).items[0]?.quantity).toBe(1);
    });

    it('rejects with 404 when the product is not in the cart', async () => {
      await cartService.addItem(1, 1, 1);

      await expect(cartService.updateQuantity(1, 2, 1)).rejects.toMatchObject({
        status: 404,
        message: 'Item not in cart',
      });
    });

    it('checks the stock before checking the cart', async () => {
      await expect(cartService.updateQuantity(1, 2, 101)).rejects.toMatchObject({ status: 409 });
    });
  });

  describe('removeItem', () => {
    it('removes the item and keeps the others', async () => {
      await cartService.addItem(1, 1, 1);
      await cartService.addItem(1, 2, 2);

      const cart = await cartService.removeItem(1, 1);

      expect(cart).toEqual({ items: [{ productId: 2, quantity: 2, price: 250 }] });
      expect(store.ttls.get('1')).toBe(86400);
    });

    it('deletes the stored cart when the last item is removed', async () => {
      await cartService.addItem(1, 1, 1);

      const cart = await cartService.removeItem(1, 1);

      expect(cart).toEqual({ items: [] });
      expect(store.values.has('1')).toBe(false);
      expect(store.deletedKeys).toEqual(['1']);
    });

    it('returns the unchanged cart when the product is not in it', async () => {
      await cartService.addItem(1, 1, 1);

      const cart = await cartService.removeItem(1, 2);

      expect(cart).toEqual({ items: [{ productId: 1, quantity: 1, price: 1000 }] });
    });

    it('deletes the key even when the cart was already empty', async () => {
      const cart = await cartService.removeItem(1, 1);

      expect(cart).toEqual({ items: [] });
      expect(store.deletedKeys).toEqual(['1']);
    });
  });

  describe('clearCart', () => {
    it('deletes the stored cart', async () => {
      await cartService.addItem(1, 1, 1);
      await cartService.addItem(1, 2, 1);

      await cartService.clearCart(1);

      expect(await cartService.getCart(1)).toEqual({ items: [] });
      expect(store.deletedKeys).toEqual(['1']);
    });

    it('leaves other users carts intact', async () => {
      await cartService.addItem(1, 1, 1);
      await cartService.addItem(2, 2, 1);

      await cartService.clearCart(1);

      expect((await cartService.getCart(2)).items).toHaveLength(1);
    });

    it('does nothing harmful for a user without a cart', async () => {
      await expect(cartService.clearCart(99)).resolves.toBeUndefined();
    });
  });
});

describe('CartService (sociable: real ProductService, DrizzleService and MemoryKVAdaptor)', () => {
  let testTarget: TestTargetResult<CartService>;
  let cartService: CartService;
  let productService: ProductService;

  beforeEach(async () => {
    testTarget = await createTestTarget(CartService);
    cartService = testTarget.target;
    productService = await testTarget.get(ProductService);
  });

  afterEach(async () => {
    await testTarget.shutdown();
  });

  it('adds a product stored in the database', async () => {
    const keyboard = await productService.create({
      name: 'Keyboard',
      description: '',
      price: 12000,
      category: 'electronics',
      stock: 3,
    });

    const cart = await cartService.addItem(1, keyboard.id, 2);

    expect(cart).toEqual({ items: [{ productId: keyboard.id, quantity: 2, price: 12000 }] });
    expect(await cartService.getCart(1)).toEqual(cart);
  });

  it('checks the stock recorded in the database', async () => {
    const keyboard = await productService.create({
      name: 'Keyboard',
      description: '',
      price: 12000,
      category: 'electronics',
      stock: 3,
    });
    await productService.update(keyboard.id, { stock: 1 });

    await expect(cartService.addItem(1, keyboard.id, 2)).rejects.toMatchObject({ status: 409 });
  });

  it('rejects with 404 for a product id that is not in the database', async () => {
    await expect(cartService.addItem(1, 12345, 1)).rejects.toMatchObject({ status: 404 });
  });

  it('rejects updates for a product removed after it was added to the cart', async () => {
    const keyboard = await productService.create({
      name: 'Keyboard',
      description: '',
      price: 12000,
      category: 'electronics',
      stock: 3,
    });
    await cartService.addItem(1, keyboard.id, 1);
    await productService.remove(keyboard.id);

    await expect(cartService.updateQuantity(1, keyboard.id, 2)).rejects.toMatchObject({
      status: 404,
      message: 'Product not found',
    });
  });

  it('still removes an item whose product was deleted', async () => {
    const keyboard = await productService.create({
      name: 'Keyboard',
      description: '',
      price: 12000,
      category: 'electronics',
      stock: 3,
    });
    await cartService.addItem(1, keyboard.id, 1);
    await productService.remove(keyboard.id);

    const cart = await cartService.updateQuantity(1, keyboard.id, 0);

    expect(cart).toEqual({ items: [] });
  });

  it('empties the cart after clearCart', async () => {
    const keyboard = await productService.create({
      name: 'Keyboard',
      description: '',
      price: 12000,
      category: 'electronics',
      stock: 3,
    });
    await cartService.addItem(1, keyboard.id, 1);

    await cartService.clearCart(1);

    expect(await cartService.getCart(1)).toEqual({ items: [] });
  });
});
