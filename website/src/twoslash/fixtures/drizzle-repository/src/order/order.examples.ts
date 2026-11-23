import { Injectable, inject } from '@zeltjs/core';
import { ConflictError } from '@zeltjs/drizzle-repository';
import { err } from 'neverthrow';

import { OrderRepositoryBase } from '../db/generated/order.repository-base';
import type { OrderExistedId } from '../domain/generated/order.model';

// Parts of the app the examples leave out.
declare const itemB: string;
declare const itemC: string;
declare const newOrderItemId: () => string;

@Injectable()
export class OrderExamples {
  private readonly orders = inject(OrderRepositoryBase);
  private readonly orderCommands = inject(OrderRepositoryBase);

  async changeItems(orderExistedId: OrderExistedId) {
    const order = await this.orders.getById(orderExistedId);
    if (order.isErr()) return err(order.error);

    const input = {
      ...order.value,
      items: [
        ...order.value.items
          .filter((item) => item.id !== itemC)
          .map((item) => (item.id === itemB ? { ...item, name: '新しい名前' } : item)),
        { id: newOrderItemId(), order_id: order.value.id, name: 'D' },
      ],
    };

    const saved = await this.orderCommands.save({ pre: order.value, input });
    if (saved.isErr() && saved.error instanceof ConflictError) {
      // The caller decides whether to read the order again.
    }
    return saved;
  }
}
