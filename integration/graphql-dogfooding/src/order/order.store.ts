import { Injectable } from '@zeltjs/core';

import type { OrderPublic } from './order.types';

// In-memory stand-in for a database. Mutable state is isolated here so the
// services stay stateless; a real app would replace this with a repository.
@Injectable()
export class OrderStore {
  private readonly ordersByCustomer = new Map<string, readonly OrderPublic[]>();
  private orderCount = 0;

  // Globally sequential so order ids never collide across customers.
  nextOrderId(): string {
    this.orderCount += 1;
    return `order_${this.orderCount}`;
  }

  append(customerId: string, order: OrderPublic): void {
    const existing = this.ordersByCustomer.get(customerId) ?? [];
    this.ordersByCustomer.set(customerId, [...existing, order]);
  }

  listByCustomer(customerId: string): readonly OrderPublic[] {
    return this.ordersByCustomer.get(customerId) ?? [];
  }
}
