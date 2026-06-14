import { Injectable } from '@zeltjs/core';

import type { CartPublicItems } from './cart.types';

// In-memory stand-in for a database. Mutable state is isolated here so the
// services stay stateless; a real app would replace this with a repository.
@Injectable()
export class CartStore {
  private readonly itemsByCustomer = new Map<string, readonly CartPublicItems[]>();

  read(customerId: string): readonly CartPublicItems[] {
    return this.itemsByCustomer.get(customerId) ?? [];
  }

  write(customerId: string, items: readonly CartPublicItems[]): void {
    this.itemsByCustomer.set(customerId, items);
  }

  clear(customerId: string): void {
    this.itemsByCustomer.delete(customerId);
  }
}
