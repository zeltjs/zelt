import { Injectable, inject } from '@zeltjs/core';
import { MemoryKVAdaptor } from '@zeltjs/kv';
import type { KVStore } from '@zeltjs/kv';
import { HTTPException } from 'hono/http-exception';

import { ProductService } from '../product/product.service';

type CartItem = {
  readonly productId: number;
  readonly quantity: number;
  readonly price: number;
};

type CartData = {
  readonly items: readonly CartItem[];
};

const CART_TTL_SEC = 86400;

@Injectable()
export class CartService {
  private readonly store: KVStore;

  constructor(
    private readonly kv = inject(MemoryKVAdaptor),
    private readonly productService = inject(ProductService),
  ) {
    this.store = this.kv.namespace('cart:');
  }

  async getCart(userId: number): Promise<CartData> {
    const cart = await this.store.get<CartData>(String(userId));
    return cart ?? { items: [] };
  }

  async addItem(userId: number, productId: number, quantity: number): Promise<CartData> {
    const product = await this.productService.findById(productId);
    if (!product) {
      throw new HTTPException(404, { message: 'Product not found' });
    }
    if (product.stock < quantity) {
      throw new HTTPException(409, { message: 'Insufficient stock' });
    }

    const cart = await this.getCart(userId);
    const existingIndex = cart.items.findIndex((item) => item.productId === productId);

    let updatedItems: CartItem[];
    if (existingIndex >= 0) {
      const existing = cart.items[existingIndex]!;
      const newQuantity = existing.quantity + quantity;
      if (product.stock < newQuantity) {
        throw new HTTPException(409, { message: 'Insufficient stock' });
      }
      updatedItems = cart.items.map((item, i) =>
        i === existingIndex ? { ...item, quantity: newQuantity } : item,
      ) as CartItem[];
    } else {
      updatedItems = [
        ...cart.items,
        { productId, quantity, price: product.price },
      ] as CartItem[];
    }

    const updated: CartData = { items: updatedItems };
    await this.store.set(String(userId), updated, { ttlSec: CART_TTL_SEC });
    return updated;
  }

  async updateQuantity(userId: number, productId: number, quantity: number): Promise<CartData> {
    if (quantity === 0) {
      return this.removeItem(userId, productId);
    }

    const product = await this.productService.findById(productId);
    if (!product) {
      throw new HTTPException(404, { message: 'Product not found' });
    }
    if (product.stock < quantity) {
      throw new HTTPException(409, { message: 'Insufficient stock' });
    }

    const cart = await this.getCart(userId);
    const exists = cart.items.some((item) => item.productId === productId);
    if (!exists) {
      throw new HTTPException(404, { message: 'Item not in cart' });
    }

    const updatedItems = cart.items.map((item) =>
      item.productId === productId ? { ...item, quantity } : item,
    ) as CartItem[];

    const updated: CartData = { items: updatedItems };
    await this.store.set(String(userId), updated, { ttlSec: CART_TTL_SEC });
    return updated;
  }

  async removeItem(userId: number, productId: number): Promise<CartData> {
    const cart = await this.getCart(userId);
    const updatedItems = cart.items.filter(
      (item) => item.productId !== productId,
    ) as CartItem[];

    const updated: CartData = { items: updatedItems };
    if (updatedItems.length === 0) {
      await this.store.del(String(userId));
    } else {
      await this.store.set(String(userId), updated, { ttlSec: CART_TTL_SEC });
    }
    return updated;
  }

  async clearCart(userId: number): Promise<void> {
    await this.store.del(String(userId));
  }
}
