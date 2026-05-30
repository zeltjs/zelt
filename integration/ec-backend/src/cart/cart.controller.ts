import { Authorized, Controller, Delete, Get, Post, Put, UseMiddleware, inject, pathParam } from '@zeltjs/core';
import { JwtMiddleware } from '@zeltjs/auth-jwt';
import { validated } from '@zeltjs/validator-valibot';

import { requireUser } from '../auth/current-user.lib';
import { CartService } from './cart.service';
import { AddToCartSchema, UpdateCartItemSchema } from './cart.schema';

@UseMiddleware(JwtMiddleware)
@Controller('/api/cart')
export class CartController {
  constructor(private readonly cartService = inject(CartService)) {}

  @Authorized()
  @Get('/')
  async getCart() {
    const user = requireUser();
    const cart = await this.cartService.getCart(user.id);
    const total = cart.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    return { ...cart, total };
  }

  @Authorized()
  @Post('/items')
  async addItem(data = validated(AddToCartSchema)) {
    const user = requireUser();
    const cart = await this.cartService.addItem(user.id, data.productId, data.quantity);
    return cart;
  }

  @Authorized()
  @Put('/items/:productId')
  async updateItem(
    productIdStr = pathParam('productId'),
    data = validated(UpdateCartItemSchema),
  ) {
    const user = requireUser();
    const productId = parseInt(productIdStr, 10);
    const cart = await this.cartService.updateQuantity(user.id, productId, data.quantity);
    return cart;
  }

  @Authorized()
  @Delete('/items/:productId')
  async removeItem(productIdStr = pathParam('productId')) {
    const user = requireUser();
    const productId = parseInt(productIdStr, 10);
    const cart = await this.cartService.removeItem(user.id, productId);
    return cart;
  }

  @Authorized()
  @Delete('/')
  async clearCart() {
    const user = requireUser();
    await this.cartService.clearCart(user.id);
    return { cleared: true };
  }
}
