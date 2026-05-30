import { Injectable, inject } from '@zeltjs/core';
import { MemoryEventBusAdaptor } from '@zeltjs/eventbus';
import { HTTPException } from 'hono/http-exception';
import { eq, sql } from 'drizzle-orm';

import { DrizzleService } from '../db/drizzle.service';
import { orders, orderItems, products } from '../db/schema';
import type { Order } from '../db/schema';
import { CartService } from '../cart/cart.service';
import './order.events';

@Injectable()
export class OrderService {
  constructor(
    private readonly drizzle = inject(DrizzleService),
    private readonly cartService = inject(CartService),
    private readonly eventBus = inject(MemoryEventBusAdaptor),
  ) {}

  async createOrder(userId: number): Promise<Order> {
    const cart = await this.cartService.getCart(userId);
    if (cart.items.length === 0) {
      throw new HTTPException(400, { message: 'Cart is empty' });
    }

    const totalPrice = cart.items.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0,
    );

    const order = this.drizzle.db.transaction((tx) => {
      for (const item of cart.items) {
        const product = tx
          .select()
          .from(products)
          .where(eq(products.id, item.productId))
          .get();

        if (!product || product.stock < item.quantity) {
          throw new HTTPException(409, {
            message: `Insufficient stock for product ${item.productId}`,
          });
        }

        tx.update(products)
          .set({ stock: sql`${products.stock} - ${item.quantity}` })
          .where(eq(products.id, item.productId))
          .run();
      }

      const newOrder = tx
        .insert(orders)
        .values({
          userId,
          totalPrice,
          status: 'confirmed',
          createdAt: new Date(),
        })
        .returning()
        .get();

      for (const item of cart.items) {
        tx.insert(orderItems)
          .values({
            orderId: newOrder.id,
            productId: item.productId,
            quantity: item.quantity,
            unitPrice: item.price,
          })
          .run();
      }

      return newOrder;
    });

    await this.cartService.clearCart(userId);

    await this.eventBus.emit('order:created', {
      orderId: order.id,
      userId,
      items: cart.items.map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
      })),
    });

    return order;
  }

  async findByUser(
    userId: number,
    page = 1,
    limit = 20,
  ): Promise<{ items: Order[]; total: number }> {
    const items = this.drizzle.db
      .select()
      .from(orders)
      .where(eq(orders.userId, userId))
      .limit(limit)
      .offset((page - 1) * limit)
      .all();

    const countResult = this.drizzle.db
      .select({ count: sql<number>`count(*)` })
      .from(orders)
      .where(eq(orders.userId, userId))
      .all();

    return { items, total: countResult[0]?.count ?? 0 };
  }

  async findById(orderId: number, userId: number): Promise<Order | undefined> {
    const order = this.drizzle.db
      .select()
      .from(orders)
      .where(eq(orders.id, orderId))
      .get();

    if (!order || order.userId !== userId) return undefined;
    return order;
  }

  async getOrderItems(orderId: number) {
    return this.drizzle.db
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, orderId))
      .all();
  }
}
