import { Injectable, inject } from '@zeltjs/core';

import { CatalogService } from '../catalog/catalog.service';
import type { CartPublic, CartPublicItems } from './cart.types';

const FREE_SHIPPING_THRESHOLD_CENTS = 15000;
const SHIPPING_CENTS = 900;

@Injectable()
export class CartService {
  private readonly itemsByCustomer = new Map<string, CartPublicItems[]>();

  constructor(private readonly catalog = inject(CatalogService) as CatalogService) {}

  currentCart(customerId: string): CartPublic {
    return this.toCart(customerId, this.itemsByCustomer.get(customerId) ?? []);
  }

  addFeaturedBundle(customerId: string): CartPublic {
    const items: CartPublicItems[] = [
      {
        productId: 'p_lamp',
        quantity: 1,
        unitPriceCents: this.catalog.requireProduct('p_lamp').priceCents,
      },
      {
        productId: 'p_notebook',
        quantity: 2,
        unitPriceCents: this.catalog.requireProduct('p_notebook').priceCents,
      },
    ];
    this.itemsByCustomer.set(customerId, items);
    return this.toCart(customerId, items);
  }

  addItem(customerId: string, productId: string, quantity: number): CartPublic {
    const product = this.catalog.requireProduct(productId);
    const items = [...(this.itemsByCustomer.get(customerId) ?? [])];
    const index = items.findIndex((item) => item.productId === productId);
    const existing = items[index];
    if (existing) {
      items[index] = { ...existing, quantity: existing.quantity + quantity };
    } else {
      items.push({ productId, quantity, unitPriceCents: product.priceCents });
    }
    this.itemsByCustomer.set(customerId, items);
    return this.toCart(customerId, items);
  }

  clear(customerId: string): void {
    this.itemsByCustomer.delete(customerId);
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
