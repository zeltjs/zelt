import { Injectable, inject } from '@zeltjs/core';

import { CartService } from '../cart/cart.service';
import type { OrderPublic } from './order.types';

@Injectable()
export class OrderService {
  private readonly ordersByCustomer = new Map<string, OrderPublic[]>();

  constructor(private readonly cartService = inject(CartService) as CartService) {}

  checkout(customerId: string): OrderPublic {
    const cart = this.cartService.currentCart(customerId);
    if (cart.items.length === 0) {
      throw new Error('Cart is empty');
    }

    const existingOrders = this.ordersByCustomer.get(customerId) ?? [];
    const order: OrderPublic = {
      id: `order_${existingOrders.length + 1}`,
      status: 'confirmed',
      itemCount: cart.totalQuantity,
      totalCents: cart.grandTotalCents,
      items: cart.items,
    };

    this.ordersByCustomer.set(customerId, [...existingOrders, order]);
    this.cartService.clear(customerId);
    return order;
  }

  history(customerId: string): readonly OrderPublic[] {
    return this.ordersByCustomer.get(customerId) ?? [];
  }
}
