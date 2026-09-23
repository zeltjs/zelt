import { MemoryEventBusAdaptor } from '@zeltjs/eventbus';
import type { TestTargetResult } from '@zeltjs/testing';
import { createTestTarget } from '@zeltjs/testing';
import { eq } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { DrizzleService } from '../infra/db/drizzle.service';
import type { Product } from '../infra/db/schema';
import { orderItems, orders, products, users } from '../infra/db/schema';
import { CartService } from './cart.service';
import { OrderService } from './order.service';
import { ProductService } from './product.service';
import '../domain/order.events';

type Cart = Awaited<ReturnType<CartService['getCart']>>;
type EmittedEvent = { readonly event: string; readonly data: unknown };

const seedUser = (drizzle: DrizzleService, email: string) =>
  drizzle.db
    .insert(users)
    .values({ email, passwordHash: 'x', name: email, createdAt: new Date() })
    .returning()
    .get();

const seedProduct = (drizzle: DrizzleService, values: { price: number; stock: number }) =>
  drizzle.db
    .insert(products)
    .values({
      name: 'Product',
      description: '',
      category: 'general',
      createdAt: new Date(),
      updatedAt: new Date(),
      ...values,
    })
    .returning()
    .get();

const seedOrder = (drizzle: DrizzleService, userId: number, createdAt: Date, totalPrice = 100) =>
  drizzle.db
    .insert(orders)
    .values({ userId, totalPrice, status: 'confirmed', createdAt })
    .returning()
    .get();

const stockOf = (drizzle: DrizzleService, productId: number) =>
  drizzle.db.select().from(products).where(eq(products.id, productId)).get()?.stock;

describe('OrderService (solitary: DrizzleService, CartService and MemoryEventBusAdaptor replaced)', () => {
  let testTarget: TestTargetResult<OrderService>;
  let orderService: OrderService;
  let clearedUsers: number[];
  let emitted: EmittedEvent[];

  beforeEach(async () => {
    clearedUsers = [];
    emitted = [];
    // DB に触れた時点で失敗させ、空カートでは DB を一切使わないことを検証する
    const untouchableDrizzle: Pick<DrizzleService, 'db'> = {
      get db(): DrizzleService['db'] {
        throw new Error('DrizzleService.db must not be touched');
      },
    };
    const fakeCartService: Pick<CartService, 'getCart' | 'clearCart'> = {
      getCart: async () => ({ items: [] }),
      clearCart: async (userId) => {
        clearedUsers.push(userId);
      },
    };
    const fakeEventBus: Pick<MemoryEventBusAdaptor, 'emit'> = {
      emit: async (event, data) => {
        emitted.push({ event, data });
      },
    };

    testTarget = await createTestTarget(OrderService, {
      overrides: [
        { provide: DrizzleService, useValue: untouchableDrizzle },
        { provide: CartService, useValue: fakeCartService },
        { provide: MemoryEventBusAdaptor, useValue: fakeEventBus },
      ],
    });
    orderService = testTarget.target;
  });

  afterEach(async () => {
    await testTarget.shutdown();
  });

  describe('createOrder', () => {
    it('rejects an empty cart with 400', async () => {
      const result = orderService.createOrder(1);

      await expect(result).rejects.toThrow(HTTPException);
      await expect(result).rejects.toMatchObject({ status: 400, message: 'Cart is empty' });
    });

    it('does not touch the database for an empty cart', async () => {
      await expect(orderService.createOrder(1)).rejects.toMatchObject({ status: 400 });
    });

    it('neither clears the cart nor emits an event for an empty cart', async () => {
      await expect(orderService.createOrder(1)).rejects.toMatchObject({ status: 400 });

      expect(clearedUsers).toEqual([]);
      expect(emitted).toEqual([]);
    });
  });
});

describe('OrderService (CartService and MemoryEventBusAdaptor replaced, real DrizzleService)', () => {
  let testTarget: TestTargetResult<OrderService>;
  let orderService: OrderService;
  let drizzle: DrizzleService;
  let carts: Map<number, Cart>;
  let clearedUsers: number[];
  let emitted: EmittedEvent[];

  beforeEach(async () => {
    carts = new Map();
    clearedUsers = [];
    emitted = [];
    const fakeCartService: Pick<CartService, 'getCart' | 'clearCart'> = {
      getCart: async (userId) => carts.get(userId) ?? { items: [] },
      clearCart: async (userId) => {
        clearedUsers.push(userId);
        carts.delete(userId);
      },
    };
    const fakeEventBus: Pick<MemoryEventBusAdaptor, 'emit'> = {
      emit: async (event, data) => {
        emitted.push({ event, data });
      },
    };

    testTarget = await createTestTarget(OrderService, {
      overrides: [
        { provide: CartService, useValue: fakeCartService },
        { provide: MemoryEventBusAdaptor, useValue: fakeEventBus },
      ],
    });
    orderService = testTarget.target;
    drizzle = await testTarget.get(DrizzleService);
  });

  afterEach(async () => {
    await testTarget.shutdown();
  });

  describe('createOrder', () => {
    let userId: number;
    let keyboard: Product;
    let mouse: Product;

    beforeEach(() => {
      userId = seedUser(drizzle, 'buyer@example.com').id;
      keyboard = seedProduct(drizzle, { price: 1000, stock: 5 });
      mouse = seedProduct(drizzle, { price: 300, stock: 2 });
    });

    it('creates a confirmed order totalling price times quantity', async () => {
      carts.set(userId, {
        items: [
          { productId: keyboard.id, quantity: 2, price: 1000 },
          { productId: mouse.id, quantity: 1, price: 300 },
        ],
      });

      const order = await orderService.createOrder(userId);

      expect(order).toMatchObject({ userId, totalPrice: 2300, status: 'confirmed' });
      expect(drizzle.db.select().from(orders).all()).toEqual([order]);
    });

    it('records one order item per cart item with the cart price as unit price', async () => {
      carts.set(userId, {
        items: [
          { productId: keyboard.id, quantity: 2, price: 1000 },
          { productId: mouse.id, quantity: 1, price: 300 },
        ],
      });

      const order = await orderService.createOrder(userId);

      expect(
        drizzle.db
          .select()
          .from(orderItems)
          .all()
          .map(({ orderId, productId, quantity, unitPrice }) => ({
            orderId,
            productId,
            quantity,
            unitPrice,
          })),
      ).toEqual([
        { orderId: order.id, productId: keyboard.id, quantity: 2, unitPrice: 1000 },
        { orderId: order.id, productId: mouse.id, quantity: 1, unitPrice: 300 },
      ]);
    });

    it('decrements the stock of each ordered product', async () => {
      carts.set(userId, {
        items: [
          { productId: keyboard.id, quantity: 2, price: 1000 },
          { productId: mouse.id, quantity: 2, price: 300 },
        ],
      });

      await orderService.createOrder(userId);

      expect(stockOf(drizzle, keyboard.id)).toBe(3);
      expect(stockOf(drizzle, mouse.id)).toBe(0);
    });

    it('clears the cart of the ordering user', async () => {
      carts.set(userId, { items: [{ productId: keyboard.id, quantity: 1, price: 1000 }] });

      await orderService.createOrder(userId);

      expect(clearedUsers).toEqual([userId]);
    });

    it('emits order:created with the ordered quantities', async () => {
      carts.set(userId, {
        items: [
          { productId: keyboard.id, quantity: 2, price: 1000 },
          { productId: mouse.id, quantity: 1, price: 300 },
        ],
      });

      const order = await orderService.createOrder(userId);

      expect(emitted).toEqual([
        {
          event: 'order:created',
          data: {
            orderId: order.id,
            userId,
            items: [
              { productId: keyboard.id, quantity: 2 },
              { productId: mouse.id, quantity: 1 },
            ],
          },
        },
      ]);
    });

    it('charges the price stored in the cart rather than the current product price (現状の振る舞い)', async () => {
      carts.set(userId, { items: [{ productId: keyboard.id, quantity: 1, price: 800 }] });

      const order = await orderService.createOrder(userId);

      expect(order.totalPrice).toBe(800);
    });

    it('rejects with 409 when the stock is insufficient', async () => {
      carts.set(userId, { items: [{ productId: mouse.id, quantity: 3, price: 300 }] });

      await expect(orderService.createOrder(userId)).rejects.toMatchObject({
        status: 409,
        message: `Insufficient stock for product ${mouse.id}`,
      });
    });

    it('rejects with 409 when the product no longer exists', async () => {
      carts.set(userId, { items: [{ productId: 999, quantity: 1, price: 300 }] });

      await expect(orderService.createOrder(userId)).rejects.toMatchObject({
        status: 409,
        message: 'Insufficient stock for product 999',
      });
    });

    it('rolls back earlier stock decrements when a later item fails', async () => {
      carts.set(userId, {
        items: [
          { productId: keyboard.id, quantity: 1, price: 1000 },
          { productId: mouse.id, quantity: 3, price: 300 },
        ],
      });

      await expect(orderService.createOrder(userId)).rejects.toMatchObject({ status: 409 });
      expect(stockOf(drizzle, keyboard.id)).toBe(5);
      expect(drizzle.db.select().from(orders).all()).toEqual([]);
      expect(drizzle.db.select().from(orderItems).all()).toEqual([]);
    });

    it('keeps the cart and emits nothing when the order fails', async () => {
      carts.set(userId, { items: [{ productId: mouse.id, quantity: 3, price: 300 }] });

      await expect(orderService.createOrder(userId)).rejects.toMatchObject({ status: 409 });
      expect(clearedUsers).toEqual([]);
      expect(emitted).toEqual([]);
    });

    it('allows ordering exactly the remaining stock', async () => {
      carts.set(userId, { items: [{ productId: mouse.id, quantity: 2, price: 300 }] });

      await expect(orderService.createOrder(userId)).resolves.toMatchObject({ totalPrice: 600 });
      expect(stockOf(drizzle, mouse.id)).toBe(0);
    });

    it('fails on the foreign key when the user does not exist (現状の振る舞い)', async () => {
      carts.set(999, { items: [{ productId: keyboard.id, quantity: 1, price: 1000 }] });

      await expect(orderService.createOrder(999)).rejects.toThrow(/FOREIGN KEY constraint failed/);
      expect(stockOf(drizzle, keyboard.id)).toBe(5);
    });
  });

  describe('findByUser', () => {
    let userId: number;
    let otherUserId: number;

    beforeEach(() => {
      userId = seedUser(drizzle, 'buyer@example.com').id;
      otherUserId = seedUser(drizzle, 'other@example.com').id;
    });

    it('returns no orders and a zero total for a user without orders', async () => {
      expect(await orderService.findByUser(userId)).toEqual({ items: [], total: 0 });
    });

    it('returns the newest order first', async () => {
      const older = seedOrder(drizzle, userId, new Date('2026-01-01T00:00:00Z'));
      const newer = seedOrder(drizzle, userId, new Date('2026-03-01T00:00:00Z'));
      const middle = seedOrder(drizzle, userId, new Date('2026-02-01T00:00:00Z'));

      const result = await orderService.findByUser(userId);

      expect(result.items.map((o) => o.id)).toEqual([newer.id, middle.id, older.id]);
    });

    it('breaks ties on creation time by the higher id first', async () => {
      const sameTime = new Date('2026-01-01T00:00:00Z');
      const first = seedOrder(drizzle, userId, sameTime);
      const second = seedOrder(drizzle, userId, sameTime);

      const result = await orderService.findByUser(userId);

      expect(result.items.map((o) => o.id)).toEqual([second.id, first.id]);
    });

    it('excludes orders of other users from items and total', async () => {
      const own = seedOrder(drizzle, userId, new Date('2026-01-01T00:00:00Z'));
      seedOrder(drizzle, otherUserId, new Date('2026-01-02T00:00:00Z'));

      const result = await orderService.findByUser(userId);

      expect(result.items.map((o) => o.id)).toEqual([own.id]);
      expect(result.total).toBe(1);
    });

    it('pages with the given page and limit while reporting the full total', async () => {
      const created = [1, 2, 3, 4, 5].map((day) =>
        seedOrder(drizzle, userId, new Date(`2026-01-0${day}T00:00:00Z`)),
      );

      const result = await orderService.findByUser(userId, 2, 2);

      expect(result.items.map((o) => o.id)).toEqual([created[2]?.id, created[1]?.id]);
      expect(result.total).toBe(5);
    });

    it('returns an empty page beyond the last one', async () => {
      seedOrder(drizzle, userId, new Date('2026-01-01T00:00:00Z'));

      expect(await orderService.findByUser(userId, 3, 10)).toEqual({ items: [], total: 1 });
    });

    it('defaults to the first page of 20 orders', async () => {
      for (let i = 0; i < 21; i++) {
        seedOrder(drizzle, userId, new Date(Date.UTC(2026, 0, 1, 0, i)));
      }

      const result = await orderService.findByUser(userId);

      expect(result.items).toHaveLength(20);
      expect(result.total).toBe(21);
    });
  });

  describe('findById', () => {
    let userId: number;
    let otherUserId: number;

    beforeEach(() => {
      userId = seedUser(drizzle, 'buyer@example.com').id;
      otherUserId = seedUser(drizzle, 'other@example.com').id;
    });

    it('returns the order owned by the user', async () => {
      const order = seedOrder(drizzle, userId, new Date('2026-01-01T00:00:00Z'), 1234);

      expect(await orderService.findById(order.id, userId)).toEqual(order);
    });

    it('hides an order owned by another user', async () => {
      const order = seedOrder(drizzle, otherUserId, new Date('2026-01-01T00:00:00Z'));

      expect(await orderService.findById(order.id, userId)).toBeUndefined();
    });

    it('returns undefined for an unknown order id', async () => {
      expect(await orderService.findById(404, userId)).toBeUndefined();
    });
  });

  describe('getOrderItems', () => {
    let userId: number;

    beforeEach(() => {
      userId = seedUser(drizzle, 'buyer@example.com').id;
    });

    it('returns the items of the order', async () => {
      const product = seedProduct(drizzle, { price: 500, stock: 1 });
      const order = seedOrder(drizzle, userId, new Date('2026-01-01T00:00:00Z'));
      drizzle.db
        .insert(orderItems)
        .values({ orderId: order.id, productId: product.id, quantity: 2, unitPrice: 500 })
        .run();

      const items = await orderService.getOrderItems(order.id);

      expect(items).toEqual([
        {
          id: expect.any(Number),
          orderId: order.id,
          productId: product.id,
          quantity: 2,
          unitPrice: 500,
        },
      ]);
    });

    it('does not include items of other orders', async () => {
      const product = seedProduct(drizzle, { price: 500, stock: 1 });
      const order = seedOrder(drizzle, userId, new Date('2026-01-01T00:00:00Z'));
      const otherOrder = seedOrder(drizzle, userId, new Date('2026-01-02T00:00:00Z'));
      drizzle.db
        .insert(orderItems)
        .values({ orderId: otherOrder.id, productId: product.id, quantity: 1, unitPrice: 500 })
        .run();

      expect(await orderService.getOrderItems(order.id)).toEqual([]);
    });

    it('returns an empty list for an unknown order', async () => {
      expect(await orderService.getOrderItems(404)).toEqual([]);
    });

    it('does not check ownership of the order (現状の振る舞い)', async () => {
      const product = seedProduct(drizzle, { price: 500, stock: 1 });
      const otherUserId = seedUser(drizzle, 'other@example.com').id;
      const othersOrder = seedOrder(drizzle, otherUserId, new Date('2026-01-01T00:00:00Z'));
      drizzle.db
        .insert(orderItems)
        .values({ orderId: othersOrder.id, productId: product.id, quantity: 1, unitPrice: 500 })
        .run();

      expect(await orderService.getOrderItems(othersOrder.id)).toHaveLength(1);
    });
  });
});

describe('OrderService (sociable: real CartService, ProductService, DrizzleService and event bus)', () => {
  let testTarget: TestTargetResult<OrderService>;
  let orderService: OrderService;
  let cartService: CartService;
  let productService: ProductService;
  let drizzle: DrizzleService;
  let eventBus: MemoryEventBusAdaptor;

  beforeEach(async () => {
    testTarget = await createTestTarget(OrderService);
    orderService = testTarget.target;
    cartService = await testTarget.get(CartService);
    productService = await testTarget.get(ProductService);
    drizzle = await testTarget.get(DrizzleService);
    eventBus = await testTarget.get(MemoryEventBusAdaptor);
  });

  afterEach(async () => {
    await testTarget.shutdown();
  });

  it('turns the cart into an order, empties the cart and lowers the stock', async () => {
    const userId = seedUser(drizzle, 'buyer@example.com').id;
    const keyboard = await productService.create({
      name: 'Keyboard',
      description: '',
      price: 12000,
      category: 'electronics',
      stock: 3,
    });
    await cartService.addItem(userId, keyboard.id, 2);

    const order = await orderService.createOrder(userId);

    expect(order).toMatchObject({ userId, totalPrice: 24000, status: 'confirmed' });
    expect(await cartService.getCart(userId)).toEqual({ items: [] });
    expect((await productService.findById(keyboard.id))?.stock).toBe(1);
    expect(await orderService.getOrderItems(order.id)).toHaveLength(1);
  });

  it('delivers order:created to subscribers of the shared event bus', async () => {
    const userId = seedUser(drizzle, 'buyer@example.com').id;
    const keyboard = await productService.create({
      name: 'Keyboard',
      description: '',
      price: 12000,
      category: 'electronics',
      stock: 3,
    });
    await cartService.addItem(userId, keyboard.id, 1);
    const received: unknown[] = [];
    await eventBus.on('order:created', (data) => {
      received.push(data);
    });

    const order = await orderService.createOrder(userId);

    expect(received).toEqual([
      { orderId: order.id, userId, items: [{ productId: keyboard.id, quantity: 1 }] },
    ]);
  });

  it('rejects the second buyer of the last item and keeps that buyer cart', async () => {
    const firstBuyer = seedUser(drizzle, 'first@example.com').id;
    const secondBuyer = seedUser(drizzle, 'second@example.com').id;
    const lastOne = await productService.create({
      name: 'Last one',
      description: '',
      price: 500,
      category: 'general',
      stock: 1,
    });
    await cartService.addItem(firstBuyer, lastOne.id, 1);
    await cartService.addItem(secondBuyer, lastOne.id, 1);

    await orderService.createOrder(firstBuyer);

    await expect(orderService.createOrder(secondBuyer)).rejects.toMatchObject({ status: 409 });
    expect((await cartService.getCart(secondBuyer)).items).toHaveLength(1);
  });

  it('rejects an empty cart with 400', async () => {
    const userId = seedUser(drizzle, 'buyer@example.com').id;

    await expect(orderService.createOrder(userId)).rejects.toMatchObject({ status: 400 });
  });

  it('lists an order placed through the cart in findByUser and findById', async () => {
    const userId = seedUser(drizzle, 'buyer@example.com').id;
    const keyboard = await productService.create({
      name: 'Keyboard',
      description: '',
      price: 12000,
      category: 'electronics',
      stock: 3,
    });
    await cartService.addItem(userId, keyboard.id, 1);

    const order = await orderService.createOrder(userId);

    expect(await orderService.findByUser(userId)).toEqual({ items: [order], total: 1 });
    expect(await orderService.findById(order.id, userId)).toEqual(order);
  });
});
