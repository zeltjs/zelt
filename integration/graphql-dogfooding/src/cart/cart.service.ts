import { Injectable, inject } from '@zeltjs/core';

import { CatalogService } from '../catalog/catalog.service';
import { CartStore } from './cart.store';
import type { CartPublic, CartPublicItems } from './cart.types';

const FREE_SHIPPING_THRESHOLD_CENTS = 15000;
const SHIPPING_CENTS = 900;

@Injectable()
export class CartService {
  constructor(
    private readonly catalog = inject(CatalogService) as CatalogService,
    private readonly store = inject(CartStore) as CartStore,
  ) {}

  currentCart(customerId: string): CartPublic {
    return this.toCart(customerId, this.store.read(customerId));
  }

  addFeaturedBundle(customerId: string): CartPublic {
    this.addItem(customerId, 'p_lamp', 1);
    return this.addItem(customerId, 'p_notebook', 2);
  }

  addItem(customerId: string, productId: string, quantity: number): CartPublic {
    const product = this.catalog.requireProduct(productId);
    const items = [...this.store.read(customerId)];
    const index = items.findIndex((item) => item.productId === productId);
    const existing = items[index];
    if (existing) {
      items[index] = { ...existing, quantity: existing.quantity + quantity };
    } else {
      items.push({ productId, quantity, unitPriceCents: product.priceCents });
    }
    this.store.write(customerId, items);
    return this.toCart(customerId, items);
  }

  clear(customerId: string): void {
    this.store.clear(customerId);
  }

  private toCart(customerId: string, items: readonly CartPublicItems[]): CartPublic {
    const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);
    const subtotalCents = items.reduce((sum, item) => sum + item.unitPriceCents * item.quantity, 0);
    const shippingEstimateCents =
      subtotalCents === 0 || subtotalCents >= FREE_SHIPPING_THRESHOLD_CENTS ? 0 : SHIPPING_CENTS;

    return {
      id: `cart_${customerId}`,
      items,
      totalQuantity,
      subtotalCents,
      shippingEstimateCents,
      grandTotalCents: subtotalCents + shippingEstimateCents,
    };
  }
}
