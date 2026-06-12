import { Injectable, inject } from '@zeltjs/core';

import { CartService } from '../cart/cart.service';
import { OrderStore } from './order.store';
import type { OrderPublic } from './order.types';

@Injectable()
export class OrderService {
  constructor(
    private readonly cartService = inject(CartService) as CartService,
    private readonly store = inject(OrderStore) as OrderStore,
  ) {}

  checkout(customerId: string): OrderPublic {
    const cart = this.cartService.currentCart(customerId);
    if (cart.items.length === 0) {
      throw new Error('Cart is empty');
    }

    const order: OrderPublic = {
      id: this.store.nextOrderId(),
      status: 'confirmed',
      itemCount: cart.totalQuantity,
      totalCents: cart.grandTotalCents,
      items: cart.items,
    };

    this.store.append(customerId, order);
    this.cartService.clear(customerId);
    return order;
  }

  history(customerId: string): readonly OrderPublic[] {
    return this.store.listByCustomer(customerId);
  }
}
